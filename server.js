const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const WIDTH = 900;
const HEIGHT = 540;
const PLAYER_RADIUS = 18;
const PLAYER_SPEED = 5.4;
const COIN_RADIUS = 11;
const MATCH_SECONDS = 60;
const INITIAL_COINS = 14;
const MAX_COINS = 18;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Coin Clash' }));

const rooms = new Map();

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomCoin() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    x: Math.round(35 + Math.random() * (WIDTH - 70)),
    y: Math.round(75 + Math.random() * (HEIGHT - 110))
  };
}

function createCoins() {
  const coins = new Map();
  for (let i = 0; i < INITIAL_COINS; i++) {
    const coin = randomCoin();
    coins.set(coin.id, coin);
  }
  return coins;
}

function spawnCoin(room) {
  if (room.coins.size < MAX_COINS) {
    const coin = randomCoin();
    room.coins.set(coin.id, coin);
  }
}

function newRoom() {
  return {
    state: 'waiting',
    players: new Map(),
    coins: createCoins(),
    startedAt: null,
    endAt: null,
    rematchVotes: new Set()
  };
}

function publicRoomState(room) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    score: p.score,
    slot: p.slot,
    color: p.color,
    connected: p.connected
  }));

  return {
    state: room.state,
    players,
    coins: [...room.coins.values()],
    remaining: room.state === 'running' ? Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000)) : room.state === 'waiting' ? MATCH_SECONDS : 0,
    winnerId: room.winnerId || null
  };
}

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('state', publicRoomState(room));
}

function startMatch(roomCode, room) {
  room.state = 'running';
  room.startedAt = Date.now();
  room.endAt = room.startedAt + MATCH_SECONDS * 1000;
  room.winnerId = null;
  room.rematchVotes.clear();
  for (const player of room.players.values()) {
    player.score = 0;
    player.x = player.slot === 0 ? 170 : WIDTH - 170;
    player.y = HEIGHT / 2;
    player.input = { x: 0, y: 0 };
  }
  io.to(roomCode).emit('matchStarted');
  emitRoom(roomCode);
}

function finishMatch(roomCode, room) {
  if (room.state !== 'running') return;
  room.state = 'finished';
  room.endAt = Date.now();
  const players = [...room.players.values()];
  const best = Math.max(...players.map((p) => p.score));
  const top = players.filter((p) => p.score === best);
  room.winnerId = top.length === 1 ? top[0].id : 'draw';
  io.to(roomCode).emit('matchFinished', { winnerId: room.winnerId });
  emitRoom(roomCode);
}

function resetForRematch(roomCode, room) {
  room.state = 'waiting';
  room.startedAt = null;
  room.endAt = null;
  room.winnerId = null;
  room.rematchVotes.clear();
  room.coins = createCoins();
  for (const player of room.players.values()) {
    player.score = 0;
    player.x = player.slot === 0 ? 170 : WIDTH - 170;
    player.y = HEIGHT / 2;
    player.input = { x: 0, y: 0 };
  }
  startMatch(roomCode, room);
}

function tryCollect(room, player) {
  if (room.state !== 'running') return;
  for (const [id, coin] of room.coins) {
    const dx = player.x - coin.x;
    const dy = player.y - coin.y;
    if (dx * dx + dy * dy <= (PLAYER_RADIUS + COIN_RADIUS) ** 2) {
      room.coins.delete(id);
      player.score += 1;
      io.to(roomCodeFor(room)).emit('coinCollected', { playerId: player.id });
      spawnCoin(room);
    }
  }
}

function roomCodeFor(targetRoom) {
  for (const [code, room] of rooms.entries()) {
    if (room === targetRoom) return code;
  }
  return null;
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  socket.on('createRoom', ({ name }, callback) => {
    const safeName = String(name || '').trim().slice(0, 18);
    if (!safeName) return callback?.({ ok: false, error: 'Enter your name first.' });

    const code = makeRoomCode();
    const room = newRoom();
    room.players.set(socket.id, {
      id: socket.id,
      name: safeName,
      slot: 0,
      x: 170,
      y: HEIGHT / 2,
      score: 0,
      color: '#6ee7ff',
      connected: true,
      input: { x: 0, y: 0 }
    });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    callback?.({ ok: true, roomCode: code, playerId: socket.id });
    emitRoom(code);
  });

  socket.on('joinRoom', ({ name, roomCode }, callback) => {
    const safeName = String(name || '').trim().slice(0, 18);
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!safeName) return callback?.({ ok: false, error: 'Enter your name first.' });
    if (!room) return callback?.({ ok: false, error: 'Room not found. Check the code.' });
    if (room.state !== 'waiting') return callback?.({ ok: false, error: 'That room is already in a match.' });
    if (room.players.size >= 2) return callback?.({ ok: false, error: 'That room is full.' });

    room.players.set(socket.id, {
      id: socket.id,
      name: safeName,
      slot: 1,
      x: WIDTH - 170,
      y: HEIGHT / 2,
      score: 0,
      color: '#ff8f70',
      connected: true,
      input: { x: 0, y: 0 }
    });
    socket.join(code);
    socket.data.roomCode = code;
    callback?.({ ok: true, roomCode: code, playerId: socket.id });
    emitRoom(code);
    startMatch(code, room);
  });

  socket.on('input', (input) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    const player = room?.players.get(socket.id);
    if (!player || room.state !== 'running') return;
    const x = Number(input?.x) || 0;
    const y = Number(input?.y) || 0;
    const length = Math.hypot(x, y);
    player.input = length > 1 ? { x: x / length, y: y / length } : { x, y };
  });

  socket.on('playAgain', () => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || room.state !== 'finished' || room.players.size !== 2) return;
    room.rematchVotes.add(socket.id);
    io.to(code).emit('rematchStatus', { ready: room.rematchVotes.size });
    if (room.rematchVotes.size === 2) resetForRematch(code, room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    room.players.delete(socket.id);
    room.rematchVotes.delete(socket.id);
    if (room.players.size === 0) {
      rooms.delete(code);
      return;
    }
    room.state = 'waiting';
    room.startedAt = null;
    room.endAt = null;
    room.winnerId = null;
    io.to(code).emit('playerLeft');
    emitRoom(code);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.state === 'running') {
      for (const player of room.players.values()) {
        player.x = clamp(player.x + player.input.x * PLAYER_SPEED, PLAYER_RADIUS, WIDTH - PLAYER_RADIUS);
        player.y = clamp(player.y + player.input.y * PLAYER_SPEED, 64 + PLAYER_RADIUS, HEIGHT - PLAYER_RADIUS);
        tryCollect(room, player);
      }
      if (now >= room.endAt) finishMatch(code, room);
      else emitRoom(code);
    } else if (room.state === 'waiting') {
      emitRoom(code);
    }
  }
}, 70);

server.listen(PORT, () => {
  console.log(`Coin Clash running on http://localhost:${PORT}`);
});

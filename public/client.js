const socket = io();

const screens = {
  home: document.getElementById('homeScreen'),
  waiting: document.getElementById('waitingScreen'),
  game: document.getElementById('gameScreen'),
  result: document.getElementById('resultScreen')
};

const playerName = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCode');
const errorText = document.getElementById('errorText');
const createBtn = document.getElementById('createBtn');
const showJoinBtn = document.getElementById('showJoinBtn');
const joinBox = document.getElementById('joinBox');
const joinBtn = document.getElementById('joinBtn');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const copyStatus = document.getElementById('copyStatus');
const waitingPlayers = document.getElementById('waitingPlayers');
const timerEl = document.getElementById('timer');
const p1Name = document.getElementById('p1Name');
const p2Name = document.getElementById('p2Name');
const p1Score = document.getElementById('p1Score');
const p2Score = document.getElementById('p2Score');
const p1Card = document.getElementById('p1Card');
const p2Card = document.getElementById('p2Card');
const connectionStatus = document.getElementById('connectionStatus');
const resultTitle = document.getElementById('resultTitle');
const resultSubtitle = document.getElementById('resultSubtitle');
const resultIcon = document.getElementById('resultIcon');
const finalScores = document.getElementById('finalScores');
const playAgainBtn = document.getElementById('playAgainBtn');
const rematchStatus = document.getElementById('rematchStatus');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let roomCode = '';
let myPlayerId = '';
let latestState = null;
let keyVector = { x: 0, y: 0 };
let touchVector = { x: 0, y: 0 };
let inputTimer = null;

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function setError(message) {
  errorText.textContent = message || '';
}

function cleanName() {
  return playerName.value.trim().slice(0, 18);
}

function cleanCode() {
  return roomCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function createGame() {
  const name = cleanName();
  if (!name) return setError('Enter your name first.');
  setError('');
  createBtn.disabled = true;
  socket.emit('createRoom', { name }, (response) => {
    createBtn.disabled = false;
    if (!response?.ok) return setError(response?.error || 'Could not create the room.');
    roomCode = response.roomCode;
    myPlayerId = response.playerId;
    copyRoomBtn.textContent = roomCode;
    showScreen('waiting');
  });
}

function joinGame() {
  const name = cleanName();
  const code = cleanCode();
  if (!name) return setError('Enter your name first.');
  if (code.length !== 5) return setError('Enter the 5-character room code.');
  setError('');
  joinBtn.disabled = true;
  socket.emit('joinRoom', { name, roomCode: code }, (response) => {
    joinBtn.disabled = false;
    if (!response?.ok) return setError(response?.error || 'Could not join the room.');
    roomCode = response.roomCode;
    myPlayerId = response.playerId;
    showScreen('game');
    startInputLoop();
  });
}

function updateWaiting(players) {
  waitingPlayers.innerHTML = players.map((player) => `<span class="player-chip">${escapeHtml(player.name)} ${player.id === myPlayerId ? '• YOU' : ''}</span>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function renderState(state) {
  latestState = state;
  if (state.state === 'waiting') {
    showScreen('waiting');
    updateWaiting(state.players);
  } else if (state.state === 'running') {
    showScreen('game');
    updateScoreboard(state.players);
    timerEl.textContent = state.remaining;
  } else if (state.state === 'finished') {
    updateScoreboard(state.players);
    timerEl.textContent = '0';
  }
}

function updateScoreboard(players) {
  const sorted = [...players].sort((a, b) => a.slot - b.slot);
  const first = sorted[0];
  const second = sorted[1];
  p1Name.textContent = first?.name || 'WAITING';
  p2Name.textContent = second?.name || 'WAITING';
  p1Score.textContent = first?.score ?? 0;
  p2Score.textContent = second?.score ?? 0;
  p1Card.style.opacity = first?.connected === false ? '.5' : '1';
  p2Card.style.opacity = second?.connected === false ? '.5' : '1';
}

function showResult(winnerId) {
  const players = latestState?.players || [];
  const winner = players.find((p) => p.id === winnerId);
  const mine = players.find((p) => p.id === myPlayerId);
  resultIcon.textContent = winnerId === 'draw' ? '🤝' : winnerId === myPlayerId ? '🏆' : '⚡';
  resultTitle.textContent = winnerId === 'draw' ? 'DRAW!' : winnerId === myPlayerId ? 'YOU WIN!' : 'MATCH LOST';
  resultSubtitle.textContent = winnerId === 'draw' ? 'Both players finished on the same score.' : `${escapeHtml(winner?.name || 'Winner')} takes the arena.`;
  finalScores.innerHTML = players.map((p) => `<div class="final-card"><strong>${escapeHtml(p.name)}</strong><b>${p.score}</b></div>`).join('');
  rematchStatus.textContent = '';
  showScreen('result');
}

function emitInput() {
  const v = Math.hypot(keyVector.x + touchVector.x, keyVector.y + touchVector.y) > 0
    ? normalize({ x: keyVector.x + touchVector.x, y: keyVector.y + touchVector.y })
    : { x: 0, y: 0 };
  socket.emit('input', v);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y);
  return len > 1 ? { x: v.x / len, y: v.y / len } : v;
}

function startInputLoop() {
  if (inputTimer) return;
  inputTimer = setInterval(emitInput, 50);
}

function keyToVector() {
  const down = (k) => heldKeys.has(k);
  keyVector = {
    x: (down('ArrowRight') || down('d') ? 1 : 0) - (down('ArrowLeft') || down('a') ? 1 : 0),
    y: (down('ArrowDown') || down('s') ? 1 : 0) - (down('ArrowUp') || down('w') ? 1 : 0)
  };
}

const heldKeys = new Set();
window.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(key)) {
    event.preventDefault();
    heldKeys.add(key);
    keyToVector();
  }
});
window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  heldKeys.delete(key);
  keyToVector();
});

document.querySelectorAll('.mobile-controls button').forEach((button) => {
  const dir = button.dataset.dir;
  const vector = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  }[dir];
  const start = (event) => { event.preventDefault(); touchVector = vector; };
  const stop = (event) => { event.preventDefault(); touchVector = { x: 0, y: 0 }; };
  button.addEventListener('touchstart', start, { passive: false });
  button.addEventListener('touchend', stop, { passive: false });
  button.addEventListener('touchcancel', stop, { passive: false });
  button.addEventListener('mousedown', start);
  button.addEventListener('mouseup', stop);
  button.addEventListener('mouseleave', stop);
});

createBtn.addEventListener('click', createGame);
showJoinBtn.addEventListener('click', () => joinBox.classList.toggle('hidden'));
joinBtn.addEventListener('click', joinGame);
roomCodeInput.addEventListener('input', () => { roomCodeInput.value = cleanCode(); });
copyRoomBtn.addEventListener('click', async () => {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    copyStatus.textContent = 'Copied! Send the code to your opponent.';
  } catch {
    copyStatus.textContent = `Room code: ${roomCode}`;
  }
});
playAgainBtn.addEventListener('click', () => {
  playAgainBtn.disabled = true;
  rematchStatus.textContent = 'Waiting for your opponent…';
  socket.emit('playAgain');
});

socket.on('state', (state) => {
  renderState(state);
  if (state.state === 'finished' && state.winnerId) showResult(state.winnerId);
});
socket.on('matchStarted', () => {
  playAgainBtn.disabled = false;
  startInputLoop();
  showScreen('game');
});
socket.on('matchFinished', ({ winnerId }) => {
  showResult(winnerId);
});
socket.on('rematchStatus', ({ ready }) => {
  if (ready === 1) rematchStatus.textContent = 'You are ready. Waiting for the other player…';
});
socket.on('waitingForPlayers', () => {
  playAgainBtn.disabled = false;
  copyStatus.textContent = 'Both players are ready for another round.';
  showScreen('waiting');
});
socket.on('playerLeft', () => {
  showScreen('waiting');
  copyStatus.textContent = 'Your opponent left. Waiting for another player…';
});
socket.on('connect', () => {
  connectionStatus.innerHTML = '<span></span> CONNECTED';
});
socket.on('disconnect', () => {
  connectionStatus.innerHTML = '<span style="background:#ff7f6a;box-shadow:0 0 12px rgba(255,127,106,.7)"></span> RECONNECTING';
});

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createLinearGradient(0, 0, 900, 540);
  bg.addColorStop(0, '#0a1020'); bg.addColorStop(1, '#0d1628');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 900, 540);

  ctx.strokeStyle = 'rgba(122, 146, 180, .08)';
  ctx.lineWidth = 1;
  for (let x = 20; x < 900; x += 40) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x, 540); ctx.stroke(); }
  for (let y = 80; y < 540; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(900, y); ctx.stroke(); }

  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  roundedRect(14, 64, 872, 460, 18); ctx.stroke();

  ctx.setLineDash([8, 12]); ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath(); ctx.moveTo(450, 65); ctx.lineTo(450, 522); ctx.stroke(); ctx.setLineDash([]);

  if (!latestState) return;
  for (const coin of latestState.coins) drawCoin(coin);
  for (const player of latestState.players) drawPlayer(player);
}

function drawCoin(coin) {
  const pulse = 1 + Math.sin(Date.now() / 140 + coin.x) * 0.08;
  ctx.save();
  ctx.translate(coin.x, coin.y);
  ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,217,94,.09)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fillStyle = '#ffd95e'; ctx.fill();
  ctx.strokeStyle = '#fff1a4'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#735d00'; ctx.font = '800 12px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.5);
  ctx.restore();
}

function drawPlayer(player) {
  const isMe = player.id === myPlayerId;
  const color = player.color || '#ffffff';
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.shadowColor = color; ctx.shadowBlur = isMe ? 22 : 14;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3; ctx.strokeStyle = '#07101b'; ctx.stroke();
  ctx.fillStyle = '#07101b'; ctx.font = '900 10px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(player.id === myPlayerId ? 'YOU' : '2P', 0, 1);
  ctx.restore();
  ctx.fillStyle = '#dce4f5'; ctx.font = '700 10px Inter'; ctx.textAlign = 'center'; ctx.fillText(player.name, player.x, player.y - 29);
}

function renderLoop() {
  drawArena();
  requestAnimationFrame(renderLoop);
}
renderLoop();

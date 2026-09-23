# Coin Clash

A real-time 2-player browser game created for the Handshake AI Skills Studio multiplayer-game challenge.

## Features
- 2-player rooms with a 5-character room code
- Real-time player movement with Socket.IO
- Server-authoritative coin collection and scoring
- 60-second matches
- Winner/draw screen
- Rematch flow
- Desktop and mobile controls
- Responsive dark gaming UI

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

To test multiplayer locally on one computer, open two browser windows. For two physical devices on the same network, use your computer's local IP address instead of localhost.

## Deploy

This project is designed for a Node.js web service that supports WebSockets, such as Render or Railway.

On Render, create a **Web Service** connected to this repository:
- Build command: `npm install`
- Start command: `npm start`
- Environment: Node

After deployment, open the generated HTTPS URL on two devices and test the room flow.

## Handshake demo checklist

1. Device A creates a room.
2. Device A shares the 5-character room code.
3. Device B opens the same public URL and joins the room.
4. Both devices see each other in the same match.
5. Move both characters.
6. Collect coins and verify both scoreboards update.
7. Wait for the 60-second timer to end.
8. Show the winner/draw screen.

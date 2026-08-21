# Sketch & Guess

**A real-time multiplayer drawing and guessing lobby.**

Build Fellowship project proposal and working full-stack prototype by Abhishek Bhadre.

## What it does

One player draws a secret word while the rest of the room race to guess it. Strokes appear live for everyone, correct guesses are hidden from players who have not solved the round, and faster guesses earn more points.

## Stack

- **Frontend:** React, Vite, HTML5 Canvas
- **Backend:** Node.js, Express, Socket.IO
- **Design:** OOP domain classes for `Lobby`, `Player`, `Round`, and `CanvasState`
- **API:** REST for lobby creation and lookup; WebSockets for game events

## Run locally

Requirements: Node.js 18+

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in two browser tabs to test multiplayer locally. The API runs on `http://localhost:3001`.

Production build:

```bash
npm run build
npm start
```

## Game flow

1. Enter a nickname and create a room, or enter a room code to join one.
2. Share the six-character room code with other players.
3. The host starts when at least two players are ready.
4. The highlighted artist draws the word shown privately above their canvas.
5. Everyone else guesses in chat. The first correct guess receives the most points.
6. After the timer ends, the answer is revealed and the next artist is selected.

## Project structure

```text
server/
	domain.js       OOP game state and round rules
	index.js        Express routes and Socket.IO event handlers
src/
	App.jsx         lobby, board, chat, and leaderboard UI
	main.jsx        React entry point
	styles.css      visual system and responsive layout
```

## REST endpoints

- `POST /api/lobbies` creates a lobby. Body: `{ "name": "Abhishek" }`
- `GET /api/lobbies/:code` returns public lobby information.

Both are rate-limited (20 requests/minute per IP).

## Real-time events

`join-room`, `start-game`, `draw`, `clear-canvas`, `guess`, and `next-round` are sent by clients. The server broadcasts authoritative `room-state`, `round-started`, `round-ended`, `game-ended`, `draw`, `canvas-cleared`, and `guess-result` events. Rounds are timed and scored server-side, and a disconnected player has a 30 second grace window to rejoin with the same `playerId` before being dropped from the room.

## Testing

```bash
npm test
```

Runs Vitest unit tests against the domain logic in `server/domain.js` (scoring, round rotation, round/game-end transitions, host handoff).

## Deploying (Render)

This app ships as a single Node web service: Express serves the API, Socket.IO, and the built React client from one process, so one Render service is enough.

1. Push this repo to GitHub and create a new **Web Service** on Render pointing at it.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Node version: 18+
5. Environment variables:
   - `CLIENT_ORIGIN` — set to your Render URL (e.g. `https://sketch-and-guess.onrender.com`) once you know it, to lock down CORS instead of leaving it open.
   - `VITE_API_URL` is only needed if the client and API are hosted on different origins; leave it unset for the single-service setup above so the client calls same-origin.

See `.env.example` for the full list of variables.

## Scope notes

Room state is kept in memory, which is fine for a single Render instance but means state resets on redeploy/restart and won't work if you scale to multiple instances without a shared store (e.g. Redis) — out of scope for this prototype. There's also no authentication beyond the per-session `playerId`, so anyone with a room code can join.

## Git workflow

Use feature branches and small commits, for example:

```bash
git switch -c feature/live-canvas
git add . && git commit -m "feat: sync drawing strokes"
```
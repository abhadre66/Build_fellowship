import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { Server } from 'socket.io';
import { Lobby, Player, makeCode } from './domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN || '*';
const io = new Server(server, { cors: { origin: allowedOrigin } });
const lobbies = new Map();
const roundTimers = new Map();
const disconnectTimers = new Map();
const DISCONNECT_GRACE_MS = 30_000;

// Behind a host's proxy the client IP arrives in X-Forwarded-For; without this every
// visitor would share one rate-limit bucket keyed to the proxy.
if (process.env.NODE_ENV === 'production' || process.env.RENDER) app.set('trust proxy', 1);

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Scoped to /api so it never counts the client's own static assets.
const limit = (max) => rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false });
app.use('/api', limit(120));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/lobbies', limit(20), (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 18);
  if (!name) return res.status(400).json({ error: 'A nickname is required.' });
  let code = makeCode();
  while (lobbies.has(code)) code = makeCode();
  const player = new Player(randomUUID(), name, true);
  const lobby = new Lobby(code, player);
  lobbies.set(code, lobby);
  res.status(201).json({ code, playerId: player.id });
});
app.get('/api/lobbies/:code', (req, res) => {
  const lobby = lobbies.get(req.params.code.toUpperCase());
  if (!lobby) return res.status(404).json({ error: 'Room not found.' });
  res.json(lobby.publicState());
});

const broadcast = (code) => io.to(code).emit('room-state', lobbies.get(code)?.publicState());

const clearRoundTimer = (code) => { clearTimeout(roundTimers.get(code)); roundTimers.delete(code); };

const beginRound = (lobby) => {
  clearRoundTimer(lobby.code);
  const round = lobby.startRound();
  if (!round) return null;
  io.to(lobby.code).emit('round-started', { ...lobby.publicState(), word: round.word });
  const timer = setTimeout(() => endRound(lobby.code), round.duration * 1000);
  roundTimers.set(lobby.code, timer);
  return round;
};

const endRound = (code) => {
  const lobby = lobbies.get(code);
  if (!lobby || !lobby.round) return;
  clearRoundTimer(code);
  const word = lobby.endRound();
  const payload = { word, players: lobby.players.map(({ id, name, score }) => ({ id, name, score })) };
  io.to(code).emit(lobby.status === 'game-ended' ? 'game-ended' : 'round-ended', payload);
  broadcast(code);
};

const guessLimiters = new Map();
const withinRate = (key, limit, windowMs) => {
  const now = Date.now();
  const hits = (guessLimiters.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  guessLimiters.set(key, hits);
  return hits.length <= limit;
};

io.on('connection', (socket) => {
  socket.on('join-room', ({ code, name, playerId }) => {
    const lobby = lobbies.get(String(code).toUpperCase());
    if (!lobby) return socket.emit('error-message', 'That room does not exist.');
    const existing = lobby.players.find((player) => player.id === playerId);
    if (existing) {
      lobby.setConnected(playerId, true);
      clearTimeout(disconnectTimers.get(`${lobby.code}:${playerId}`));
      disconnectTimers.delete(`${lobby.code}:${playerId}`);
    } else {
      lobby.addPlayer(new Player(playerId || randomUUID(), String(name).trim().slice(0, 18)));
    }
    socket.join(lobby.code);
    socket.data.code = lobby.code;
    socket.data.playerId = existing ? playerId : (playerId || lobby.players[lobby.players.length - 1].id);
    socket.emit('joined', { playerId: socket.data.playerId });
    broadcast(lobby.code);
  });
  socket.on('start-game', () => {
    const lobby = lobbies.get(socket.data.code);
    const player = lobby?.players.find((item) => item.id === socket.data.playerId);
    if (!lobby || !player?.isHost || lobby.players.length < 2) return;
    beginRound(lobby);
  });
  socket.on('draw', (stroke) => {
    if (!withinRate(`draw:${socket.id}`, 200, 1000)) return;
    const lobby = lobbies.get(socket.data.code);
    if (lobby?.round?.artistId === socket.data.playerId) { lobby.canvas.add(stroke); socket.to(lobby.code).emit('draw', stroke); }
  });
  socket.on('clear-canvas', () => { const lobby = lobbies.get(socket.data.code); if (lobby?.round?.artistId === socket.data.playerId) { lobby.canvas.clear(); io.to(lobby.code).emit('canvas-cleared'); } });
  socket.on('guess', (text) => {
    if (!withinRate(`guess:${socket.id}`, 10, 5000)) return;
    const lobby = lobbies.get(socket.data.code); if (!lobby) return;
    const result = lobby.guess(socket.data.playerId, String(text).slice(0, 60));
    if (result.correct) io.to(lobby.code).emit('guess-result', result); else socket.emit('guess-result', { correct: false });
    if (result.allGuessed) endRound(lobby.code); else broadcast(lobby.code);
  });
  socket.on('next-round', () => {
    const lobby = lobbies.get(socket.data.code);
    const player = lobby?.players.find((item) => item.id === socket.data.playerId);
    if (!lobby || !player?.isHost) return;
    beginRound(lobby);
  });
  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    const lobby = lobbies.get(code);
    if (!lobby) return;
    lobby.setConnected(playerId, false);
    broadcast(code);
    const timer = setTimeout(() => {
      lobby.removePlayer(playerId);
      disconnectTimers.delete(`${code}:${playerId}`);
      broadcast(code);
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(`${code}:${playerId}`, timer);
  });
});

// Serve the built client whenever a build is present, rather than keying off
// NODE_ENV — a deploy that builds should serve, however the host sets its env.
const distPath = path.join(__dirname, '..', 'dist');
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const port = process.env.PORT || 3001;
server.listen(port, () => console.log(`Sketch & Guess API listening on ${port}`));

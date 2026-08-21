const WORDS = [
  'lighthouse', 'volcano', 'pancake', 'spaceship', 'telescope', 'octopus', 'guitar', 'rainbow', 'campfire', 'submarine',
  'dinosaur', 'umbrella', 'penguin', 'waterfall', 'sandwich', 'astronaut', 'butterfly', 'jellyfish', 'skateboard', 'pyramid',
  'cactus', 'lantern', 'dragon', 'igloo', 'tornado', 'hammock', 'kangaroo', 'compass', 'firework', 'snowman',
];
const MAX_ROUNDS = 5;
const pickWord = (excluded) => {
  const pool = WORDS.filter((word) => !excluded.has(word));
  const source = pool.length > 0 ? pool : WORDS;
  return source[Math.floor(Math.random() * source.length)];
};

export class Player {
  constructor(id, name, isHost = false) {
    this.id = id;
    this.name = name;
    this.score = 0;
    this.isHost = isHost;
    this.hasGuessed = false;
    this.connected = true;
  }
}

export class CanvasState {
  constructor() { this.strokes = []; }
  add(stroke) { this.strokes.push(stroke); }
  clear() { this.strokes = []; }
}

export class Round {
  constructor(players, roundNumber = 1, usedWords = new Set()) {
    this.number = roundNumber;
    this.artistIndex = Math.floor(Math.random() * players.length);
    this.word = pickWord(usedWords);
    usedWords.add(this.word);
    if (usedWords.size >= WORDS.length) usedWords.clear();
    this.startedAt = Date.now();
    this.duration = 60;
    this.solvedBy = [];
    this.players = players;
  }
  get artistId() { return this.players?.[this.artistIndex]?.id; }
  getRemaining() { return Math.max(0, this.duration - Math.floor((Date.now() - this.startedAt) / 1000)); }
}

export class Lobby {
  constructor(code, host) {
    this.code = code;
    this.players = [host];
    this.canvas = new CanvasState();
    this.round = null;
    this.status = 'waiting';
    this.maxRounds = MAX_ROUNDS;
    this.usedWords = new Set();
  }
  addPlayer(player) { if (!this.players.some((item) => item.name.toLowerCase() === player.name.toLowerCase())) this.players.push(player); }
  setConnected(playerId, connected) { const player = this.players.find((item) => item.id === playerId); if (player) player.connected = connected; }
  removePlayer(playerId) {
    const wasHost = this.players.find((item) => item.id === playerId)?.isHost;
    this.players = this.players.filter((item) => item.id !== playerId);
    if (wasHost && this.players.length > 0 && !this.players.some((item) => item.isHost)) this.players[0].isHost = true;
  }
  publicState() {
    return {
      code: this.code,
      status: this.status,
      players: this.players.map(({ id, name, score, isHost, hasGuessed, connected }) => ({ id, name, score, isHost, hasGuessed, connected })),
      round: this.round ? { number: this.round.number, artistId: this.players[this.round.artistIndex]?.id, remaining: this.round.getRemaining(), solvedCount: this.round.solvedBy.length } : null,
      strokes: this.canvas.strokes,
      maxRounds: this.maxRounds,
    };
  }
  canStartRound() { return (this.round?.number || 0) < this.maxRounds; }
  startRound() {
    if (!this.canStartRound()) return null;
    this.round = new Round(this.players, (this.round?.number || 0) + 1, this.usedWords);
    this.players.forEach((player) => { player.hasGuessed = false; });
    this.canvas.clear();
    this.status = 'playing';
    return this.round;
  }
  endRound() {
    const word = this.round?.word;
    this.status = this.canStartRound() ? 'round-ended' : 'game-ended';
    return word;
  }
  guess(playerId, text) {
    if (!this.round || this.status !== 'playing' || this.round.artistId === playerId) return { correct: false };
    const player = this.players.find((item) => item.id === playerId);
    if (!player || player.hasGuessed) return { correct: false };
    if (text.trim().toLowerCase() !== this.round.word) return { correct: false };
    player.hasGuessed = true;
    const points = Math.max(100, this.round.getRemaining() * 10);
    player.score += points;
    this.round.solvedBy.push(playerId);
    const guessers = this.players.filter((item) => item.id !== this.round.artistId);
    const allGuessed = guessers.length > 0 && guessers.every((item) => item.hasGuessed);
    return { correct: true, points, name: player.name, solvedCount: this.round.solvedBy.length, allGuessed };
  }
}

export const makeCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

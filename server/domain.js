const WORDS = [
  'lighthouse', 'volcano', 'pancake', 'spaceship', 'telescope', 'octopus', 'guitar', 'rainbow', 'campfire', 'submarine',
  'dinosaur', 'umbrella', 'penguin', 'waterfall', 'sandwich', 'astronaut', 'butterfly', 'jellyfish', 'skateboard', 'pyramid',
  'cactus', 'lantern', 'dragon', 'igloo', 'tornado', 'hammock', 'kangaroo', 'compass', 'firework', 'snowman',
];
const shuffle = (items) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
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
  constructor(players, roundNumber = 1, usedWords = new Set(), artistId = null) {
    this.number = roundNumber;
    this.artistId = artistId;
    this.word = pickWord(usedWords);
    usedWords.add(this.word);
    if (usedWords.size >= WORDS.length) usedWords.clear();
    this.startedAt = Date.now();
    this.duration = 60;
    this.solvedBy = [];
    this.awards = [];
    this.players = players;
  }
  getRemaining() { return Math.max(0, this.duration - Math.floor((Date.now() - this.startedAt) / 1000)); }
}

export class Lobby {
  constructor(code, host) {
    this.code = code;
    this.players = [host];
    this.canvas = new CanvasState();
    this.round = null;
    this.status = 'waiting';
    // Fixed once the game starts: a shuffled order so everyone draws exactly once.
    this.turnOrder = [];
    this.turnIndex = -1;
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
      round: this.round ? { number: this.round.number, artistId: this.round.artistId, remaining: this.round.getRemaining(), solvedCount: this.round.solvedBy.length } : null,
      strokes: this.canvas.strokes,
      maxRounds: this.turnOrder.length || this.players.length,
    };
  }
  // A turn only counts if that player is still in the room, so someone leaving
  // mid-game shortens the game rather than stranding it on a missing artist.
  canStartRound() {
    if (this.turnOrder.length === 0) return this.players.length >= 2;
    return this.turnOrder.slice(this.turnIndex + 1).some((id) => this.players.some((player) => player.id === id));
  }
  nextArtistId() {
    while (this.turnIndex + 1 < this.turnOrder.length) {
      this.turnIndex += 1;
      const id = this.turnOrder[this.turnIndex];
      if (this.players.some((player) => player.id === id)) return id;
    }
    return null;
  }
  startRound() {
    if (!this.canStartRound()) return null;
    if (this.turnOrder.length === 0) this.turnOrder = shuffle(this.players.map((player) => player.id));
    const artistId = this.nextArtistId();
    if (!artistId) return null;
    this.round = new Round(this.players, (this.round?.number || 0) + 1, this.usedWords, artistId);
    this.players.forEach((player) => { player.hasGuessed = false; });
    this.canvas.clear();
    this.status = 'playing';
    return this.round;
  }
  endRound() {
    const round = this.round;
    if (!round) return { word: undefined, artistBonus: 0, artistName: undefined };
    // The artist earns the average of what the solvers scored, so a drawing that
    // lands quickly is worth as much to draw as it is to guess.
    const artist = this.players.find((player) => player.id === round.artistId);
    const artistBonus = round.awards.length
      ? Math.round(round.awards.reduce((sum, points) => sum + points, 0) / round.awards.length)
      : 0;
    if (artist) artist.score += artistBonus;
    this.status = this.canStartRound() ? 'round-ended' : 'game-ended';
    return { word: round.word, artistBonus, artistName: artist?.name };
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
    this.round.awards.push(points);
    const guessers = this.players.filter((item) => item.id !== this.round.artistId);
    const allGuessed = guessers.length > 0 && guessers.every((item) => item.hasGuessed);
    return { correct: true, points, name: player.name, solvedCount: this.round.solvedBy.length, allGuessed };
  }
}

export const makeCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

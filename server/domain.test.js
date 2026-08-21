import { describe, expect, it } from 'vitest';
import { Lobby, Player, Round } from './domain.js';

const makeLobby = (playerCount = 2) => {
  const host = new Player('p0', 'Host', true);
  const lobby = new Lobby('ABC123', host);
  for (let i = 1; i < playerCount; i += 1) lobby.addPlayer(new Player(`p${i}`, `Guest${i}`));
  return lobby;
};

describe('Lobby.startRound', () => {
  it('rotates through players and clears the canvas', () => {
    const lobby = makeLobby();
    lobby.canvas.add({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
    const round = lobby.startRound();
    expect(round.number).toBe(1);
    expect(lobby.status).toBe('playing');
    expect(lobby.canvas.strokes).toHaveLength(0);
    expect(lobby.players.some((player) => player.id === round.artistId)).toBe(true);
  });

  it('refuses to start once maxRounds is reached', () => {
    const lobby = makeLobby();
    lobby.maxRounds = 1;
    lobby.startRound();
    expect(lobby.startRound()).toBeNull();
  });
});

describe('Lobby.guess', () => {
  it('awards points to the first correct non-artist guesser', () => {
    const lobby = makeLobby();
    const round = lobby.startRound();
    const guesserId = lobby.players.find((player) => player.id !== round.artistId).id;
    const result = lobby.guess(guesserId, round.word.toUpperCase());
    expect(result.correct).toBe(true);
    expect(lobby.players.find((player) => player.id === guesserId).score).toBeGreaterThan(0);
  });

  it('rejects the artist guessing their own word', () => {
    const lobby = makeLobby();
    const round = lobby.startRound();
    const result = lobby.guess(round.artistId, round.word);
    expect(result.correct).toBe(false);
  });

  it('rejects a second guess from the same player', () => {
    const lobby = makeLobby();
    const round = lobby.startRound();
    const guesserId = lobby.players.find((player) => player.id !== round.artistId).id;
    lobby.guess(guesserId, round.word);
    const second = lobby.guess(guesserId, round.word);
    expect(second.correct).toBe(false);
  });

  it('flags allGuessed once every non-artist player has solved it', () => {
    const lobby = makeLobby(3);
    const round = lobby.startRound();
    const guesserIds = lobby.players.filter((player) => player.id !== round.artistId).map((player) => player.id);
    const first = lobby.guess(guesserIds[0], round.word);
    expect(first.allGuessed).toBe(false);
    const second = lobby.guess(guesserIds[1], round.word);
    expect(second.allGuessed).toBe(true);
  });
});

describe('Round word selection', () => {
  it('avoids repeating a word until the pool is exhausted', () => {
    const used = new Set();
    const seen = new Set();
    for (let i = 0; i < 30; i += 1) {
      const round = new Round([new Player('p0', 'Host', true), new Player('p1', 'Guest')], i + 1, used);
      expect(seen.has(round.word)).toBe(false);
      seen.add(round.word);
    }
  });
});

describe('Lobby.endRound', () => {
  it('moves to round-ended while rounds remain', () => {
    const lobby = makeLobby();
    lobby.maxRounds = 3;
    lobby.startRound();
    lobby.endRound();
    expect(lobby.status).toBe('round-ended');
  });

  it('moves to game-ended after the final round', () => {
    const lobby = makeLobby();
    lobby.maxRounds = 1;
    lobby.startRound();
    lobby.endRound();
    expect(lobby.status).toBe('game-ended');
  });
});

describe('Lobby.removePlayer', () => {
  it('promotes a new host when the host disconnects for good', () => {
    const lobby = makeLobby(3);
    lobby.removePlayer('p0');
    expect(lobby.players).toHaveLength(2);
    expect(lobby.players.some((player) => player.isHost)).toBe(true);
  });
});

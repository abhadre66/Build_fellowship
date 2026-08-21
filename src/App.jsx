import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const socket = io(API, { autoConnect: false });
const SESSION_KEY = 'sketch-and-guess-session';

const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveSession = (session) => localStorage.setItem(SESSION_KEY, JSON.stringify(session));
const clearSession = () => localStorage.removeItem(SESSION_KEY);

const CANVAS_BG = '#fffdf9';
const COLORS = ['#202522', '#ef6b52', '#c9432f', '#e8a33d', '#3a6ea5', '#37856b', '#8b5fbf'];
const PENCILS = [{ id: 'thin', size: 3 }, { id: 'medium', size: 6 }, { id: 'thick', size: 12 }];
const ERASER_SIZE = 24;

const EraserIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.5 4.5 21 8 10.5 18.5H6L2.5 15 13 4.5a2 2 0 0 1 4.5 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 12.5 13.5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M6 18.5h13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;

function LobbyScreen({ onEnter, initialError }) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [error, setError] = useState(initialError || '');
  const create = async () => { const response = await fetch(`${API}/api/lobbies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const data = await response.json(); if (!response.ok) return setError(data.error); onEnter({ name, code: data.code, playerId: data.playerId }); };
  const join = async () => { const clean = code.trim().toUpperCase(); const response = await fetch(`${API}/api/lobbies/${clean}`); if (!response.ok) return setError('That room does not exist.'); onEnter({ name, code: clean, playerId: crypto.randomUUID() }); };
  return <main className="landing"><div className="brand-mark">S<span>&</span>G</div><p className="eyebrow">BUILD FELLOWSHIP / 01</p><h1>Sketch <i>&</i><br />Guess.</h1><p className="lede">One canvas. One secret word.<br />A room full of terrible guesses.</p><section className="join-panel"><label>YOUR NICKNAME<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Picasso Jr." maxLength="18" /></label><div className="action-row"><button className="primary" disabled={!name.trim()} onClick={create}>Create room <span>↗</span></button><div className="or">or</div><div className="join-field"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ROOM CODE" maxLength="6" /><button className="icon-button" disabled={!name.trim() || code.length !== 6} onClick={join} aria-label="Join room">→</button></div></div>{error && <p className="error">{error}</p>}</section><p className="fine-print">Real-time multiplayer / 2–8 players / 60 second rounds</p></main>;
}

function Canvas({ artist, strokes, onDraw, onClear }) {
  const ref = useRef(null); const drawing = useRef(false);
  const [color, setColor] = useState(COLORS[0]); const [pencil, setPencil] = useState(PENCILS[1].id); const [eraser, setEraser] = useState(false);
  useEffect(() => { const context = ref.current?.getContext('2d'); if (!context) return; context.clearRect(0, 0, 900, 560); context.lineCap = 'round'; context.lineJoin = 'round'; strokes.forEach((stroke) => { context.strokeStyle = stroke.color; context.lineWidth = stroke.size; context.beginPath(); context.moveTo(stroke.from.x, stroke.from.y); context.lineTo(stroke.to.x, stroke.to.y); context.stroke(); }); }, [strokes]);
  const point = (event) => { const box = ref.current.getBoundingClientRect(); return { x: ((event.clientX - box.left) / box.width) * 900, y: ((event.clientY - box.top) / box.height) * 560 }; };
  const activeSize = PENCILS.find((item) => item.id === pencil)?.size || PENCILS[1].size;
  const move = (event) => { if (!drawing.current || !artist) return; const to = point(event); const from = drawing.current; const stroke = { from, to, color: eraser ? CANVAS_BG : color, size: eraser ? ERASER_SIZE : activeSize }; onDraw(stroke); drawing.current = to; };
  const pickColor = (value) => { setColor(value); setEraser(false); };
  const pickPencil = (id) => { setPencil(id); setEraser(false); };
  return <div className={`canvas-wrap ${artist ? 'is-artist' : ''}`}><canvas ref={ref} width="900" height="560" onPointerDown={(event) => { if (artist) { drawing.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} /><div className="canvas-tools">{artist ? <>
    <div className="palette">{COLORS.map((value) => <button key={value} className={`swatch ${!eraser && value === color ? 'active' : ''}`} style={{ background: value }} onClick={() => pickColor(value)} aria-label={`Color ${value}`} />)}</div>
    <div className="pencils">{PENCILS.map((item) => <button key={item.id} className={`pencil-button ${!eraser && pencil === item.id ? 'active' : ''}`} onClick={() => pickPencil(item.id)} aria-label={`${item.id} pencil`}><span className="pencil-dot" style={{ width: item.size, height: item.size }} /></button>)}</div>
    <button className={`eraser-button ${eraser ? 'active' : ''}`} onClick={() => setEraser((current) => !current)} aria-label="Eraser"><EraserIcon /></button>
    <button onClick={onClear}>Clear canvas</button>
  </> : <span>Watch the artist work</span>}</div></div>;
}

function GameScreen({ session, onLeave }) {
  const [state, setState] = useState(null); const [word, setWord] = useState(''); const [messages, setMessages] = useState([]); const [guess, setGuess] = useState(''); const [notice, setNotice] = useState(''); const [time, setTime] = useState(0); const [reveal, setReveal] = useState(null); const [final, setFinal] = useState(null);
  const addMessage = (message) => setMessages((current) => [...current.slice(-30), message]);
  useEffect(() => {
    socket.connect(); socket.emit('join-room', session);
    socket.on('room-state', (data) => { setState(data); setTime((current) => data.round ? data.round.remaining : current); });
    socket.on('round-started', (data) => { setState(data); setWord(data.word); setTime(data.round.remaining); setMessages([]); setReveal(null); setFinal(null); });
    socket.on('draw', (stroke) => setState((current) => ({ ...current, strokes: [...current.strokes, stroke] })));
    socket.on('canvas-cleared', () => setState((current) => ({ ...current, strokes: [] })));
    socket.on('guess-result', (result) => { if (result.correct) { addMessage({ type: 'success', text: `${result.name} guessed it! +${result.points}` }); setNotice('Correct guess!'); } });
    socket.on('round-ended', (data) => setReveal(data));
    socket.on('game-ended', (data) => setFinal(data));
    socket.on('error-message', (message) => { setNotice(message); clearSession(); onLeave(); });
    return () => { socket.off(); socket.disconnect(); };
  }, [session]);
  useEffect(() => { const timer = setInterval(() => setTime((current) => Math.max(0, current - 1)), 1000); return () => clearInterval(timer); }, []);
  if (!state) return <div className="loading">Joining room...</div>;
  const player = state.players.find((item) => item.id === session.playerId); const artist = state.round?.artistId === session.playerId; const host = player?.isHost;
  const sendGuess = (event) => { event.preventDefault(); if (!guess.trim()) return; socket.emit('guess', guess); addMessage({ name: session.name, text: guess }); setGuess(''); };
  const start = () => socket.emit(state.status === 'waiting' ? 'start-game' : 'next-round');
  if (final) return <main className="landing"><div className="brand-mark">S<span>&</span>G</div><p className="eyebrow">GAME OVER</p><h1>Final <i>scores</i></h1><section className="join-panel">{final.players.sort((a, b) => b.score - a.score).map((item, index) => <div className="player-row" key={item.id}><span className="rank">0{index + 1}</span><span>{item.name}</span><strong>{item.score}</strong></div>)}<button className="primary" onClick={() => { clearSession(); onLeave(); }}>Back to lobby <span>↗</span></button></section></main>;
  return <main className="game"><header className="game-header"><div className="brand-small">S<span>&</span>G</div><div className="room-chip"><span>ROOM</span>{state.code}<button onClick={() => navigator.clipboard?.writeText(state.code)} aria-label="Copy room code">□</button></div><div className="header-player"><span className="avatar">{session.name[0]}</span>{session.name}<strong>{player?.score || 0} pts</strong></div></header><div className="game-grid"><section className="play-area"><div className="round-meta"><div><span className="eyebrow">ROUND {state.round?.number || 0}/{state.maxRounds}</span><h2>{artist ? <>Draw <b>{word}</b></> : <>Guess the word <b>••••••••</b></>}</h2></div><div className={`timer ${time < 15 ? 'urgent' : ''}`}><span>TIME</span>{String(time).padStart(2, '0')}</div></div><Canvas artist={artist} strokes={state.strokes || []} onDraw={(stroke) => { socket.emit('draw', stroke); setState((current) => ({ ...current, strokes: [...current.strokes, stroke] })); }} onClear={() => socket.emit('clear-canvas')} />{state.status === 'waiting' && <div className="waiting"><p>Waiting for the host to start the round.</p>{host && <button className="primary" disabled={state.players.length < 2} onClick={start}>Start game <span>↗</span></button>}</div>}{reveal && <div className="waiting"><p>The word was <b>{reveal.word}</b>.</p>{host && <button className="primary next-button" onClick={start}>Next round <span>↗</span></button>}</div>}</section><aside className="sidebar"><div className="side-section"><div className="section-title"><span>PLAYERS</span><em>{state.players.length}/8</em></div>{state.players.sort((a, b) => b.score - a.score).map((item, index) => <div className={`player-row ${item.id === state.round?.artistId ? 'artist-row' : ''}`} key={item.id}><span className="rank">0{index + 1}</span><span className="avatar">{item.name[0]}</span><span>{item.name}{item.id === session.playerId && ' (you)'}{!item.connected && ' (away)'}</span><strong>{item.score}</strong>{item.id === state.round?.artistId && <small>✎</small>}</div>)}</div><div className="side-section chat"><div className="section-title"><span>GUESSES</span><em>LIVE</em></div><div className="messages">{messages.length === 0 && <p className="muted">Guesses appear here...</p>}{messages.map((message, index) => <p className={message.type || ''} key={index}>{message.name && <b>{message.name}: </b>}{message.text}</p>)}</div><form onSubmit={sendGuess}><input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={artist ? 'You are drawing...' : 'Type your guess...'} disabled={artist || state.status !== 'playing'} /><button disabled={artist || !guess.trim()} aria-label="Send guess">↗</button></form></div>{notice && <div className="notice">{notice}</div>}</aside></div></main>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkedSession, setCheckedSession] = useState(false);
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return setCheckedSession(true);
    fetch(`${API}/api/lobbies/${saved.code}`).then((response) => { if (response.ok) setSession(saved); else clearSession(); }).finally(() => setCheckedSession(true));
  }, []);
  const enter = (next) => { saveSession(next); setSession(next); };
  const leave = () => setSession(null);
  if (!checkedSession) return <div className="loading">Loading...</div>;
  return session ? <GameScreen session={session} onLeave={leave} /> : <LobbyScreen onEnter={enter} />;
}

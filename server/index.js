/*
 * Make 24 race server (Stage 3): two players race through a match of up to 10 rounds,
 * with a running scoreboard.
 *
 * Run with:  npm install   (first time only)
 *            npm start
 * Then open the address it prints, at /race.html, on two devices or two browser windows.
 */
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { makePuzzle } = require('../public/js/solver.js');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;
const COUNTDOWN_MS = 3000;
const PREC = { '+': 1, '−': 1, '×': 2, '÷': 2 };

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const io = new Server(server);

/* ---------- Game state (one match at a time) ----------
 * A match is 1–10 rounds (the host chooses). Each round, the first player to
 * make 24 wins it and scores points: 1000 for an instant answer, dropping
 * steadily to 500 at 60 seconds or slower.
 */
const MAX_ROUNDS = 10;
const game = {
  phase: 'lobby',          // lobby → countdown → playing → result → … → final
  seq: 0,                  // counts every round ever played (lets screens tell rounds apart)
  matchRounds: 5,          // rounds in this match (host chooses 1–10)
  matchRound: 0,           // round number within the current match (0 = not started)
  players: new Map(),      // socket.id → { name, ready, gaveUp, cardsLeft, layout, sel, moveSeq, lastMove, points, wins, gained }
  puzzle: null,            // { nums, sols }
  startAt: 0,              // server time the round started
  result: null,            // { winner, winnerId, time, expr, points, solution }
};

const hostId = () => game.players.keys().next().value || null;
const roundPoints = time => Math.round(1000 - 500 * Math.min(time, 60) / 60);

function publicState() {
  return {
    phase: game.phase,
    round: game.seq,
    matchRound: game.matchRound,
    matchRounds: game.matchRounds,
    hostId: hostId(),
    players: [...game.players.entries()].map(([id, p]) => ({
      id, name: p.name, ready: p.ready, gaveUp: p.gaveUp, cardsLeft: p.cardsLeft,
      // Shape of the player's board for the opponent's face-down view (never the numbers)
      layout: p.layout, sel: p.sel, moveSeq: p.moveSeq, lastMove: p.lastMove,
      points: p.points, wins: p.wins, gained: p.gained,
    })),
    result: game.result,
  };
}
const broadcast = () => io.emit('state', publicState());

function uniqueName(raw) {
  let name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 16) || 'Player';
  const taken = new Set([...game.players.values()].map(p => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

function resetBoardShape(p) {
  p.cardsLeft = 4; p.layout = [true, true, true, true]; p.sel = null; p.lastMove = null; p.moveSeq = (p.moveSeq || 0) + 1;
}

function resetScores() {
  for (const p of game.players.values()) { p.points = 0; p.wins = 0; p.gained = 0; }
}

function startRound() {
  if (game.matchRound === 0) resetScores();   // first round of a new match
  game.phase = 'countdown';
  game.seq++;
  game.matchRound++;
  game.puzzle = makePuzzle();
  game.result = null;
  for (const p of game.players.values()) { p.ready = false; p.gaveUp = false; p.gained = 0; resetBoardShape(p); }
  game.startAt = Date.now() + COUNTDOWN_MS;
  io.emit('round', { round: game.seq, nums: game.puzzle.nums, countdownMs: COUNTDOWN_MS });
  broadcast();
  setTimeout(() => {
    if (game.phase !== 'countdown') return;
    game.phase = 'playing';
    broadcast();
  }, COUNTDOWN_MS);
}

function endRound(result) {
  if (result.winnerId) {
    const w = game.players.get(result.winnerId);
    result.points = roundPoints(result.time);
    w.points += result.points; w.wins += 1; w.gained = result.points;
  }
  game.result = { ...result, solution: game.puzzle.sols[0]?.e || null };
  game.phase = game.matchRound >= game.matchRounds ? 'final' : 'result';
  broadcast();
}

function backToLobby(message) {
  game.phase = 'lobby';
  game.matchRound = 0;
  game.result = null;
  for (const p of game.players.values()) { p.ready = false; p.gaveUp = false; resetBoardShape(p); }
  resetScores();
  if (message) io.emit('notice', message);
  broadcast();
}

/*
 * Replay a player's moves on the real puzzle and check they make 24.
 * A move {a, b, op} combines card a with card b; the result replaces card b.
 * Same rules as the game: whole numbers only, no dividing by zero.
 */
function checkMoves(nums, moves) {
  if (!Array.isArray(moves) || moves.length !== 3) return null;
  const slots = nums.map(n => ({ v: n, e: String(n), prec: 3 }));
  for (const m of moves) {
    const { a, b, op } = m || {};
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !PREC[op]) return null;
    const x = slots[a], y = slots[b];
    if (!x || !y) return null;
    let v;
    if (op === '+') v = x.v + y.v;
    else if (op === '−') v = x.v - y.v;
    else if (op === '×') v = x.v * y.v;
    else { if (y.v === 0 || x.v % y.v !== 0) return null; v = x.v / y.v; }
    const p = PREC[op];
    const L = x.prec < p ? `(${x.e})` : x.e;
    const R = (y.prec < p || (y.prec === p && (op === '−' || op === '÷'))) ? `(${y.e})` : y.e;
    slots[b] = { v, e: `${L} ${op} ${R}`, prec: p };
    slots[a] = null;
  }
  const last = slots.filter(Boolean);
  return last.length === 1 && last[0].v === 24 ? last[0].e : null;
}

/* ---------- Connections ---------- */
io.on('connection', socket => {
  socket.emit('state', publicState());

  socket.on('join', (name, reply) => {
    if (game.players.has(socket.id)) return reply?.({ ok: true });
    if (game.players.size >= MAX_PLAYERS) return reply?.({ ok: false, error: 'This game already has two players.' });
    if (game.phase !== 'lobby') return reply?.({ ok: false, error: 'A round is in progress. Try again in a moment.' });
    const player = { name: uniqueName(name), ready: false, gaveUp: false, points: 0, wins: 0, gained: 0 };
    resetBoardShape(player);
    game.players.set(socket.id, player);
    reply?.({ ok: true, name: player.name, id: socket.id });
    broadcast();
  });

  socket.on('ready', () => {
    const p = game.players.get(socket.id);
    if (!p || !['lobby', 'result', 'final'].includes(game.phase)) return;
    if (game.phase === 'final') {   // match over: back to the waiting room for a new match
      backToLobby();
    }
    p.ready = true;
    const all = [...game.players.values()];
    if (all.length === MAX_PLAYERS && all.every(q => q.ready)) startRound();
    else broadcast();
  });

  socket.on('setRounds', n => {
    if (socket.id !== hostId() || game.phase !== 'lobby') return;
    game.matchRounds = Math.max(1, Math.min(MAX_ROUNDS, Math.round(Number(n)) || 5));
    broadcast();
  });

  // A player's board changed: which slots hold cards, which card is selected, and the last move.
  socket.on('progress', info => {
    const p = game.players.get(socket.id);
    if (!p || game.phase !== 'playing' || !info || typeof info !== 'object') return;
    const layout = Array.isArray(info.layout) && info.layout.length === 4 ? info.layout.map(Boolean) : null;
    if (!layout || !layout.some(Boolean)) return;
    p.layout = layout;
    p.cardsLeft = layout.filter(Boolean).length;
    p.sel = Number.isInteger(info.sel) && layout[info.sel] ? info.sel : null;
    const m = info.move;
    if (m && Number.isInteger(m.a) && Number.isInteger(m.b) && m.a !== m.b && m.a >= 0 && m.a < 4 && m.b >= 0 && m.b < 4) {
      p.lastMove = { kind: 'move', a: m.a, b: m.b }; p.moveSeq++;
    } else if (info.kind === 'undo' || info.kind === 'reset') {
      p.lastMove = { kind: info.kind }; p.moveSeq++;
    }
    broadcast();
  });

  socket.on('submit', (moves, reply) => {
    const p = game.players.get(socket.id);
    if (!p || game.phase !== 'playing') return reply?.({ ok: false, error: 'The round is over.' });
    const expr = checkMoves(game.puzzle.nums, moves);
    if (!expr) return reply?.({ ok: false, error: 'That doesn’t make 24.' });
    const time = (Date.now() - game.startAt) / 1000;
    reply?.({ ok: true });
    endRound({ winner: p.name, winnerId: socket.id, time, expr });
  });

  socket.on('giveUp', () => {
    const p = game.players.get(socket.id);
    if (!p || game.phase !== 'playing') return;
    p.gaveUp = true;
    if ([...game.players.values()].every(q => q.gaveUp)) endRound({ winner: null });
    else broadcast();
  });

  socket.on('disconnect', () => {
    const p = game.players.get(socket.id);
    if (!p) return;
    game.players.delete(socket.id);
    if (game.phase === 'lobby') broadcast();
    else backToLobby(`${p.name} left the game.`);
  });
});

/* ---------- Start ---------- */
server.listen(PORT, () => {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\nMake 24 server is running.\n');
  console.log(`  On this computer:   http://localhost:${PORT}/race.html`);
  for (const a of addresses) console.log(`  On the same Wi-Fi:  http://${a}:${PORT}/race.html`);
  console.log('\nPress Ctrl+C to stop.\n');
});

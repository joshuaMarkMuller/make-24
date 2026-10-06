/*
 * Make 24 race server (Stage 4): up to 24 players race in small groups.
 *
 * The host chooses 4 or 5 cards per puzzle; the target is always 24.
 * Each round the players are drawn into pairs (plus one group of three when the
 * number is odd), with new opponents every round where possible. Every group gets
 * the same four cards at the same moment. Everyone who makes 24 within the
 * 30-second limit scores points for their own speed, and the first in each group
 * gets a bonus for winning the race. All scores go into one shared scoreboard.
 *
 * The teacher runs the game from the host screen (/host.html): they choose the
 * match length, start each round and watch the live scoreboard, but don't play.
 *
 * Run with:  npm install   (first time only)
 *            npm start
 * Open /host.html on the teacher's computer, and the /race.html address it prints
 * on each player's device.
 */
const path = require('path');
const http = require('http');
const os = require('os');
const express = require('express');
const { Server } = require('socket.io');
const { makePuzzle } = require('../public/js/solver.js');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 24;
const MAX_ROUNDS = 10;
const COUNTDOWN_MS = 3000;
const ROUND_MS = 30000;            // time limit for each round
const FIRST_BONUS = 100;           // extra points for being first in your group
const BONK = 500;                  // points the host can take away from a suspected cheat
const PREC = { '+': 1, '−': 1, '×': 2, '÷': 2 };

// Addresses players can use to reach this computer (shown on the host screen)
const LAN_IPS = Object.values(os.networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const JOIN_URLS = LAN_IPS.map(a => `http://${a}:${PORT}/race.html`);

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const io = new Server(server);

/* ---------- Game state (one match at a time) ---------- */
const game = {
  phase: 'lobby',          // lobby → countdown → playing → result → … → final
  seq: 0,                  // counts every round ever played (lets screens tell rounds apart)
  matchRounds: 5,          // rounds in this match (host chooses 1–10)
  cardCount: 4,            // cards per puzzle (host chooses 4 or 5); the target is always 24
  matchRound: 0,           // round number within the current match (0 = not started)
  hostSocket: null,        // socket.id of the host screen (not a player)
  players: new Map(),      // socket.id → player (see newPlayer)
  groups: [],              // this round's groups: { id, members: [ids], winnerId, solvers: [{ id, time, expr, points, first }], done }
  pairCounts: new Map(),   // "idA|idB" → times these two have raced each other this match
  puzzle: null,            // { nums, sols }
  startAt: 0,              // server time the round started (after the countdown)
  endsAt: 0,               // server time the round's time limit runs out
  timers: [],
  result: null,
};

const hostId = () => game.hostSocket;
// Speed points: 1000 for an instant answer, dropping steadily to 500 at the time limit
const roundPoints = time => Math.round(1000 - 500 * Math.min(time, ROUND_MS / 1000) / (ROUND_MS / 1000));

function newPlayer(name) {
  const p = { name, points: 0, wins: 0, gained: 0, bonks: 0, group: null, gaveUp: false, solved: false };
  resetBoardShape(p);
  return p;
}
function resetBoardShape(p) {
  p.cardsLeft = game.cardCount; p.layout = new Array(game.cardCount).fill(true); p.sel = null; p.lastMove = null; p.moveSeq = (p.moveSeq || 0) + 1;
}

function publicState() {
  return {
    phase: game.phase,
    round: game.seq,
    matchRound: game.matchRound,
    matchRounds: game.matchRounds,
    cardCount: game.cardCount,
    hostId: hostId(),
    hostConnected: !!game.hostSocket,
    joinUrls: JOIN_URLS,
    nums: game.phase === 'lobby' ? null : game.puzzle?.nums || null,
    maxPlayers: MAX_PLAYERS,
    limitMs: ROUND_MS,
    firstBonus: FIRST_BONUS,
    timeLeftMs: game.phase === 'playing' ? Math.max(0, game.endsAt - Date.now()) : null,
    players: [...game.players.entries()].map(([id, p]) => ({
      id, name: p.name, points: p.points, wins: p.wins, gained: p.gained, bonks: p.bonks,
      group: p.group, gaveUp: p.gaveUp, solved: p.solved,
      // Shape of the player's board for their opponents' face-down view (never the numbers)
      layout: p.layout, sel: p.sel, moveSeq: p.moveSeq, lastMove: p.lastMove,
    })),
    groups: game.groups.map(g => ({ id: g.id, members: g.members, winnerId: g.winnerId, done: g.done })),
    result: game.result,
  };
}
const broadcast = () => io.emit('state', publicState());

// Tidy a name and make it unique among the other players (exceptId: a player being renamed)
function uniqueName(raw, exceptId) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 16) || 'Player';
  const taken = new Set([...game.players.entries()].filter(([id]) => id !== exceptId).map(([, p]) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

function clearTimers() { game.timers.forEach(clearTimeout); game.timers = []; }

/* ---------- Drawing the groups ----------
 * Even number of players → all pairs. Odd → pairs plus one group of three.
 * e.g. 6 → 2+2+2, 7 → 2+2+3, 19 → eight pairs and one three.
 * We try many random draws and keep the one that repeats the fewest
 * pairings from earlier rounds of this match.
 */
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function splitIntoGroups(order) {
  const groups = [];
  const pairsEnd = order.length % 2 === 0 ? order.length : order.length - 3;
  for (let i = 0; i < pairsEnd; i += 2) groups.push(order.slice(i, i + 2));
  if (pairsEnd < order.length) groups.push(order.slice(pairsEnd));
  return groups;
}
function repeatCost(groups) {
  let cost = 0;
  for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
    cost += game.pairCounts.get(pairKey(g[i], g[j])) || 0;
  return cost;
}
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
function drawGroups(ids) {
  let best = null, bestCost = Infinity;
  for (let t = 0; t < 300 && bestCost > 0; t++) {
    const groups = splitIntoGroups(shuffle(ids));
    const cost = repeatCost(groups);
    if (cost < bestCost) { best = groups; bestCost = cost; }
  }
  for (const g of best) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const k = pairKey(g[i], g[j]); game.pairCounts.set(k, (game.pairCounts.get(k) || 0) + 1);
  }
  return best;
}

/* ---------- Rounds ---------- */
function resetMatch() {
  game.matchRound = 0;
  game.pairCounts.clear();
  game.groups = [];
  game.result = null;
  for (const p of game.players.values()) { p.points = 0; p.wins = 0; p.gained = 0; p.bonks = 0; p.group = null; p.gaveUp = false; p.solved = false; resetBoardShape(p); }
}

function startRound() {
  clearTimers();
  if (game.matchRound === 0) resetMatch();
  const ids = [...game.players.keys()];
  game.groups = drawGroups(ids).map((members, i) => ({ id: i, members, winnerId: null, solvers: [], done: false }));
  for (const p of game.players.values()) { p.group = null; p.gaveUp = false; p.solved = false; p.gained = 0; resetBoardShape(p); }
  game.groups.forEach(g => g.members.forEach(id => { game.players.get(id).group = g.id; }));

  game.phase = 'countdown';
  game.seq++;
  game.matchRound++;
  game.puzzle = makePuzzle(game.cardCount);
  game.result = null;
  game.startAt = Date.now() + COUNTDOWN_MS;
  game.endsAt = game.startAt + ROUND_MS;
  io.emit('round', { round: game.seq, nums: game.puzzle.nums, countdownMs: COUNTDOWN_MS, limitMs: ROUND_MS });
  broadcast();
  game.timers.push(setTimeout(() => {
    if (game.phase !== 'countdown') return;
    game.phase = 'playing';
    broadcast();
  }, COUNTDOWN_MS));
  game.timers.push(setTimeout(() => { if (game.phase === 'playing') endRound(false, 'time'); }, COUNTDOWN_MS + ROUND_MS));
}

// A group's race is over once nobody in it is still trying (everyone has solved, given up or left)
function groupFinishedCheck(g) {
  if (g.done) return;
  const live = g.members.filter(id => { const p = game.players.get(id); return p && !p.gaveUp && !p.solved; });
  if (live.length === 0) g.done = true;
}

function checkRoundOver() {
  if (game.phase === 'playing' && game.groups.every(g => g.done)) endRound(false, 'done');
}

// reason: 'time' (the 30 seconds ran out), 'done' (everyone finished) or 'host' (End Game)
function endRound(endMatch = false, reason = 'done') {
  clearTimers();
  const nameOf = id => game.players.get(id)?.name || 'A player who left';
  const fastest = game.groups.flatMap(g => g.solvers).sort((a, b) => a.time - b.time)[0];
  game.result = {
    groups: game.groups.map(g => ({
      members: g.members, names: g.members.map(nameOf),
      winnerId: g.winnerId, winner: g.winnerId ? nameOf(g.winnerId) : null,
      solvers: g.solvers.map(x => ({ ...x, name: nameOf(x.id) })),
    })),
    solvedCount: game.groups.reduce((n, g) => n + g.solvers.length, 0),
    fastest: fastest ? { id: fastest.id, name: nameOf(fastest.id), time: fastest.time } : null,
    solution: game.puzzle.sols[0]?.e || null,
  };
  game.result.reason = endMatch ? 'host' : reason;
  game.result.endedEarly = endMatch && game.matchRound < game.matchRounds;
  game.phase = endMatch || game.matchRound >= game.matchRounds ? 'final' : 'result';
  broadcast();
}

function backToLobby(message) {
  clearTimers();
  game.phase = 'lobby';
  resetMatch();
  if (message) io.emit('notice', message);
  broadcast();
}

/*
 * Replay a player's moves on the real puzzle and check they make 24.
 * A move {a, b, op} combines card a with card b; the result replaces card b.
 * Same rules as the game: whole numbers only, no dividing by zero.
 */
function checkMoves(nums, moves) {
  if (!Array.isArray(moves) || moves.length !== nums.length - 1) return null;
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

  // The host screen claims control of the game. Only one host at a time.
  socket.on('host', reply => {
    if (game.hostSocket && game.hostSocket !== socket.id && io.sockets.sockets.has(game.hostSocket))
      return reply?.({ ok: false, error: 'Another screen is already hosting this game. Close it first, then refresh this page.' });
    if (game.players.has(socket.id)) return reply?.({ ok: false, error: 'This window has already joined as a player.' });
    game.hostSocket = socket.id;
    reply?.({ ok: true, id: socket.id });
    broadcast();
  });

  // Players can join at any time; anyone joining mid-round plays from the next round.
  socket.on('join', (name, reply) => {
    if (socket.id === game.hostSocket) return reply?.({ ok: false, error: 'This window is the host screen.' });
    if (game.players.has(socket.id)) return reply?.({ ok: true });
    if (game.players.size >= MAX_PLAYERS) return reply?.({ ok: false, error: `This game is full (${MAX_PLAYERS} players).` });
    const player = newPlayer(uniqueName(name));
    game.players.set(socket.id, player);
    reply?.({ ok: true, name: player.name, id: socket.id });
    broadcast();
  });

  // Host only: start the match, the next round, or a new match
  socket.on('start', () => {
    if (socket.id !== hostId()) return;
    if (game.players.size < 2) return socket.emit('notice', 'At least 2 players need to join before you can start.');
    if (game.phase === 'final') { resetMatch(); game.phase = 'lobby'; }
    if (game.phase === 'lobby' || game.phase === 'result') startRound();
  });

  // Host only: go back to the waiting room after a match
  // Host only: end the match now. Any race still going stops (points already scored
  // count) and the scoreboard as it stands becomes the final result.
  socket.on('endMatch', () => {
    if (socket.id !== hostId()) return;
    if (game.phase === 'countdown' || game.phase === 'playing') endRound(true);
    else if (game.phase === 'result') {
      game.result.endedEarly = game.matchRound < game.matchRounds;
      game.phase = 'final';
      broadcast();
    }
  });

  // Host only, during a match: "bonk" a suspected cheat, taking 500 points (never below 0)
  socket.on('bonk', (id, reply) => {
    if (socket.id !== hostId()) return reply?.({ ok: false, error: 'Only the host can bonk players.' });
    if (game.phase === 'lobby') return reply?.({ ok: false, error: 'There are no scores to bonk yet.' });
    const p = game.players.get(id);
    if (!p) return reply?.({ ok: false, error: 'That player has left.' });
    const taken = Math.min(BONK, p.points);
    p.points -= taken; p.bonks += 1;
    reply?.({ ok: true, taken });
    broadcast();                                          // new scores first…
    io.emit('bonked', { id, name: p.name, taken });       // …then every screen plays the bonk animation
  });

  // Host only, in the waiting room: change a player's name (e.g. if it's inappropriate)
  socket.on('rename', ({ id, name } = {}, reply) => {
    if (socket.id !== hostId()) return reply?.({ ok: false, error: 'Only the host can rename players.' });
    if (game.phase !== 'lobby') return reply?.({ ok: false, error: 'Names can only be changed in the waiting room.' });
    const p = game.players.get(id);
    if (!p) return reply?.({ ok: false, error: 'That player has left.' });
    if (!String(name || '').trim()) return reply?.({ ok: false, error: 'Type a name first.' });
    p.name = uniqueName(name, id);
    io.to(id).emit('renamed', p.name);
    reply?.({ ok: true, name: p.name });
    broadcast();
  });

  socket.on('toLobby', () => {
    if (socket.id !== hostId() || game.phase !== 'final') return;
    backToLobby();
  });

  // Host only, in the waiting room: 4 or 5 cards per puzzle
  socket.on('setCards', n => {
    if (socket.id !== hostId() || game.phase !== 'lobby') return;
    const c = Math.round(Number(n));
    if (![4, 5].includes(c)) return;
    game.cardCount = c;
    for (const p of game.players.values()) resetBoardShape(p);
    broadcast();
  });

  socket.on('setRounds', n => {
    if (socket.id !== hostId() || game.phase !== 'lobby') return;
    game.matchRounds = Math.max(1, Math.min(MAX_ROUNDS, Math.round(Number(n)) || 5));
    broadcast();
  });

  // A player's board changed: which slots hold cards, which card is selected, and the last move.
  socket.on('progress', info => {
    const p = game.players.get(socket.id);
    if (!p || p.group === null || game.phase !== 'playing' || !info || typeof info !== 'object') return;
    const n = game.puzzle ? game.puzzle.nums.length : game.cardCount;
    const layout = Array.isArray(info.layout) && info.layout.length === n ? info.layout.map(Boolean) : null;
    if (!layout || !layout.some(Boolean)) return;
    p.layout = layout;
    p.cardsLeft = layout.filter(Boolean).length;
    p.sel = Number.isInteger(info.sel) && layout[info.sel] ? info.sel : null;
    const m = info.move;
    if (m && Number.isInteger(m.a) && Number.isInteger(m.b) && m.a !== m.b && m.a >= 0 && m.a < n && m.b >= 0 && m.b < n) {
      p.lastMove = { kind: 'move', a: m.a, b: m.b }; p.moveSeq++;
    } else if (info.kind === 'undo' || info.kind === 'reset') {
      p.lastMove = { kind: info.kind }; p.moveSeq++;
    }
    broadcast();
  });

  socket.on('submit', (moves, reply) => {
    const p = game.players.get(socket.id);
    const g = p && p.group !== null ? game.groups[p.group] : null;
    if (!g || game.phase !== 'playing' || p.gaveUp) return reply?.({ ok: false, error: 'The round is over.' });
    if (p.solved) return reply?.({ ok: false, error: 'You have already made 24 this round.' });
    const expr = checkMoves(game.puzzle.nums, moves);
    if (!expr) return reply?.({ ok: false, error: 'That doesn’t make 24.' });
    const time = (Date.now() - game.startAt) / 1000;
    const first = !g.winnerId;
    const points = roundPoints(time) + (first ? FIRST_BONUS : 0);
    if (first) { g.winnerId = socket.id; p.wins += 1; }
    g.solvers.push({ id: socket.id, time, expr, points, first });
    p.solved = true; p.points += points; p.gained = points;
    groupFinishedCheck(g);
    reply?.({ ok: true, time, points, first, bonus: first ? FIRST_BONUS : 0 });
    broadcast();
    checkRoundOver();
  });

  socket.on('giveUp', () => {
    const p = game.players.get(socket.id);
    const g = p && p.group !== null ? game.groups[p.group] : null;
    if (!g || game.phase !== 'playing' || p.solved || p.gaveUp) return;
    p.gaveUp = true;
    groupFinishedCheck(g);
    broadcast();
    checkRoundOver();
  });

  socket.on('disconnect', () => {
    if (socket.id === game.hostSocket) { game.hostSocket = null; broadcast(); return; }
    const p = game.players.get(socket.id);
    if (!p) return;
    game.players.delete(socket.id);
    io.emit('notice', `${p.name} left the game.`);
    if (game.phase !== 'lobby' && game.players.size < 2) return backToLobby('Not enough players left, so the match has ended.');
    if (p.group !== null && game.groups[p.group]) {
      const g = game.groups[p.group];
      groupFinishedCheck(g);
    }
    broadcast();
    checkRoundOver();
  });
});

/* ---------- Start ---------- */
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('\nMake 24 server is running.\n');
    console.log(`  Host screen (open on your computer):  http://localhost:${PORT}/host.html`);
    for (const u of JOIN_URLS) console.log(`  Players join at (same Wi-Fi):         ${u}`);
    console.log('\nPress Ctrl+C to stop.\n');
  });
}

// Exported for tests
module.exports = { splitIntoGroups };

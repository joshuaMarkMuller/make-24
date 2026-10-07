/*
 * room.js — one lobby's game (the Stage 4 class race, unchanged in how it plays).
 *
 * Every lobby has its own code, host, players, settings, rounds and scoreboard.
 * Messages only ever go to sockets in this lobby (Socket.IO room = the lobby code),
 * so many classes can play on one server at the same time without seeing each other.
 *
 * Rules: up to 24 players, drawn into pairs each round (plus one group of three when
 * the number is odd), new opponents every round where possible. Every group gets the
 * same 4 or 5 cards at once. Everyone who makes 24 within 30 seconds scores points
 * for their own speed, and the first in each group gets a bonus.
 */
const crypto = require('crypto');
const { makePuzzle } = require('../public/js/solver.js');

const MAX_PLAYERS = 24;
const MAX_ROUNDS = 10;
const COUNTDOWN_MS = 3000;
const ROUND_MS = 30000;            // time limit for each round
const FIRST_BONUS = 100;           // extra points for being first in your group
const NEXT_MS = 3000;              // countdown on the results before the next round starts by itself
const OUT_OF_TIME_MS = 1900;       // players' screens show “Out of time!” this long before the results
const BONK = 500;                  // points the host can take away from a suspected cheat
const PREC = { '+': 1, '−': 1, '×': 2, '÷': 2 };

// Speed points: 1000 for an instant answer, dropping steadily to 500 at the time limit
const roundPoints = time => Math.round(1000 - 500 * Math.min(time, ROUND_MS / 1000) / (ROUND_MS / 1000));

/* ---------- Drawing the groups ----------
 * Even number of players → all pairs. Odd → pairs plus one group of three.
 * e.g. 6 → 2+2+2, 7 → 2+2+3, 19 → eight pairs and one three.
 */
function splitIntoGroups(order) {
  const groups = [];
  const pairsEnd = order.length % 2 === 0 ? order.length : order.length - 3;
  for (let i = 0; i < pairsEnd; i += 2) groups.push(order.slice(i, i + 2));
  if (pairsEnd < order.length) groups.push(order.slice(pairsEnd));
  return groups;
}
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
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

function createRoom(io, code, { joinUrls = [] } = {}) {
  const game = {
    phase: 'lobby',          // lobby → countdown → playing → result → … → final
    seq: 0,                  // counts every round ever played (lets screens tell rounds apart)
    matchRounds: 5,          // rounds in this match (host chooses 1–10)
    cardCount: 4,            // cards per puzzle (host chooses 4 or 5); the target is always 24
    matchRound: 0,           // round number within the current match (0 = not started)
    hostSocket: null,        // socket.id of the host screen (not a player)
    hostKey: crypto.randomBytes(12).toString('hex'),   // lets the host screen reclaim the lobby after a refresh
    players: new Map(),      // socket.id → player (see newPlayer)
    groups: [],              // this round's groups: { id, members, winnerId, solvers, done }
    pairCounts: new Map(),   // "idA|idB" → times these two have raced each other this match
    puzzle: null,            // { nums, sols }
    startAt: 0,              // server time the round started (after the countdown)
    endsAt: 0,               // server time the round's time limit runs out
    timers: [],
    result: null,
    lastActive: Date.now(),
  };
  const emit = (event, data) => io.to(code).emit(event, data);
  const hostId = () => game.hostSocket;

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
      code,
      phase: game.phase,
      round: game.seq,
      matchRound: game.matchRound,
      matchRounds: game.matchRounds,
      cardCount: game.cardCount,
      hostId: hostId(),
      hostConnected: !!game.hostSocket,
      joinUrls,
      nums: game.phase === 'lobby' ? null : game.puzzle?.nums || null,
      maxPlayers: MAX_PLAYERS,
      limitMs: ROUND_MS,
      firstBonus: FIRST_BONUS,
      timeLeftMs: game.phase === 'playing' ? Math.max(0, game.endsAt - Date.now()) : null,
      nextInMs: game.phase === 'result' && game.nextAt ? Math.max(0, game.nextAt - Date.now()) : null,   // auto-start of the next round
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
  const broadcast = () => { game.lastActive = Date.now(); emit('state', publicState()); };

  // Tidy a name and make it unique among the other players (exceptId: a player being renamed)
  function uniqueName(raw, exceptId) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 16) || 'Player';
    const taken = new Set([...game.players.entries()].filter(([id]) => id !== exceptId).map(([, p]) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }

  function clearTimers() { game.timers.forEach(clearTimeout); game.timers = []; }

  function repeatCost(groups) {
    let cost = 0;
    for (const g of groups) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
      cost += game.pairCounts.get(pairKey(g[i], g[j])) || 0;
    return cost;
  }
  // Try many random draws and keep the one that repeats the fewest earlier pairings
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
    emit('round', { round: game.seq, nums: game.puzzle.nums, countdownMs: COUNTDOWN_MS, limitMs: ROUND_MS });
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
    // Between rounds: once the results are on screen, count down 3 seconds and start the next round
    game.nextAt = 0;
    if (game.phase === 'result') {
      const wait = (reason === 'time' ? OUT_OF_TIME_MS : 0) + NEXT_MS;
      game.nextAt = Date.now() + wait;
      game.timers.push(setTimeout(() => { if (game.phase === 'result' && game.players.size >= 2) startRound(); }, wait));
    }
    broadcast();
  }

  function backToLobby(message) {
    clearTimers();
    game.phase = 'lobby';
    resetMatch();
    if (message) emit('notice', message);
    broadcast();
  }

  /* ---------- Joining the lobby ---------- */

  // The host screen takes control of this lobby
  function claimHost(socket) {
    game.hostSocket = socket.id;
    socket.join(code);
    attach(socket);
    broadcast();
  }
  const hostIsConnected = () => !!game.hostSocket && io.sockets.sockets.has(game.hostSocket);

  // A player joins. Anyone joining mid-round plays from the next round.
  function addPlayer(socket, name) {
    if (game.players.size >= MAX_PLAYERS) return { ok: false, error: `This lobby is full (${MAX_PLAYERS} players).` };
    const player = newPlayer(uniqueName(name));
    game.players.set(socket.id, player);
    socket.join(code);
    attach(socket);
    broadcast();
    return { ok: true, name: player.name, id: socket.id, code };
  }

  /* ---------- Messages from this lobby's host and players ---------- */
  function attach(socket) {
    if (socket.data.attached) return;
    socket.data.attached = true;
    socket.data.code = code;
    const isHost = () => socket.id === hostId();

    // Host only: start the match, the next round, or a new match
    socket.on('start', () => {
      if (!isHost()) return;
      if (game.players.size < 2) return socket.emit('notice', 'At least 2 players need to join before you can start.');
      if (game.phase === 'final') { resetMatch(); game.phase = 'lobby'; }
      if (game.phase === 'lobby' || game.phase === 'result') startRound();
    });

    // Host only: end the match now. Any race still going stops (points already scored
    // count) and the scoreboard as it stands becomes the final result.
    socket.on('endMatch', () => {
      if (!isHost()) return;
      if (game.phase === 'countdown' || game.phase === 'playing') endRound(true);
      else if (game.phase === 'result') {
        clearTimers();
        game.result.endedEarly = game.matchRound < game.matchRounds;
        game.phase = 'final';
        broadcast();
      }
    });

    // Host only, during a match: "bonk" a suspected cheat, taking 500 points (never below 0)
    socket.on('bonk', (id, reply) => {
      if (!isHost()) return reply?.({ ok: false, error: 'Only the host can bonk players.' });
      if (game.phase === 'lobby') return reply?.({ ok: false, error: 'There are no scores to bonk yet.' });
      const p = game.players.get(id);
      if (!p) return reply?.({ ok: false, error: 'That player has left.' });
      const taken = Math.min(BONK, p.points);
      p.points -= taken; p.bonks += 1;
      reply?.({ ok: true, taken });
      broadcast();                                    // new scores first…
      emit('bonked', { id, name: p.name, taken });    // …then every screen plays the bonk animation
    });

    // Host only, in the waiting room: change a player's name (e.g. if it's inappropriate)
    socket.on('rename', ({ id, name } = {}, reply) => {
      if (!isHost()) return reply?.({ ok: false, error: 'Only the host can rename players.' });
      if (game.phase !== 'lobby') return reply?.({ ok: false, error: 'Names can only be changed in the waiting room.' });
      const p = game.players.get(id);
      if (!p) return reply?.({ ok: false, error: 'That player has left.' });
      if (!String(name || '').trim()) return reply?.({ ok: false, error: 'Type a name first.' });
      p.name = uniqueName(name, id);
      io.to(id).emit('renamed', p.name);
      reply?.({ ok: true, name: p.name });
      broadcast();
    });

    // Host only: go back to the waiting room after a match
    socket.on('toLobby', () => {
      if (!isHost() || game.phase !== 'final') return;
      backToLobby();
    });

    // Host only, in the waiting room: 4 or 5 cards per puzzle
    socket.on('setCards', n => {
      if (!isHost() || game.phase !== 'lobby') return;
      const c = Math.round(Number(n));
      if (![4, 5].includes(c)) return;
      game.cardCount = c;
      for (const p of game.players.values()) resetBoardShape(p);
      broadcast();
    });

    socket.on('setRounds', n => {
      if (!isHost() || game.phase !== 'lobby') return;
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
      emit('notice', `${p.name} left the game.`);
      if (game.phase !== 'lobby' && game.players.size < 2) return backToLobby('Not enough players left, so the match has ended.');
      if (p.group !== null && game.groups[p.group]) groupFinishedCheck(game.groups[p.group]);
      broadcast();
      checkRoundOver();
    });
  }

  return {
    code,
    get hostKey() { return game.hostKey; },
    claimHost, hostIsConnected, addPlayer,
    // A lobby can be cleared away once nobody is in it and nothing has happened for a while
    isAbandoned: idleMs => !hostIsConnected() && game.players.size === 0 && Date.now() - game.lastActive > idleMs,
    touch: () => { game.lastActive = Date.now(); },
    close: () => clearTimers(),
  };
}

module.exports = { createRoom, splitIntoGroups, checkMoves, MAX_PLAYERS };

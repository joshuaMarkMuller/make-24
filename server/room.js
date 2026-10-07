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
const { cleanEmoji } = require('../public/js/emoji.js');

const MAX_PLAYERS = 24;
const MAX_ROUNDS = 10;
const COUNTDOWN_MS = 3000;
const ROUND_MS = 30000;            // time limit for each round
const FIRST_BONUS = 100;           // extra points for being first in your group
const NEXT_MS = 3000;              // countdown on the results before the next round starts by itself
const OUT_OF_TIME_MS = 1900;       // players' screens show “Out of time!” this long before the results
const BONK = 500;
const LIVES = 3;                   // elimination mode: default lives each player starts with (host chooses 3–5)
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
    mode: 'points',          // 'points' (most points after N rounds wins) or 'elim' (lives, last one standing wins)
    startLives: LIVES,       // elimination: lives each player starts with (host chooses 3–5)
    hold: false,             // host paused: the next round waits until the host resumes
    matchRounds: 5,          // rounds in this match (host chooses 1–10; points mode only)
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
    // Players who dropped out after the match started (phone locked, page closed…), by lower-case
    // name. The lobby is closed once a match starts, but these players may rejoin and keep their score.
    departed: new Map(),
  };
  const emit = (event, data) => io.to(code).emit(event, data);
  const hostId = () => game.hostSocket;

  function newPlayer(name, emoji) {
    const p = { name, emoji: cleanEmoji(emoji), lives: game.startLives, out: false, outRound: 0, lostLife: false, points: 0, wins: 0, gained: 0, bonks: 0, group: null, gaveUp: false, solved: false };
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
      mode: game.mode,
      hold: game.hold,
      maxLives: game.startLives,
      cardCount: game.cardCount,
      hostId: hostId(),
      hostConnected: !!game.hostSocket,
      lobbyOpen: game.phase === 'lobby',   // joining closes when the match starts
      joinUrls,
      nums: game.phase === 'lobby' ? null : game.puzzle?.nums || null,
      maxPlayers: MAX_PLAYERS,
      limitMs: ROUND_MS,
      firstBonus: FIRST_BONUS,
      timeLeftMs: game.phase === 'playing' ? Math.max(0, game.endsAt - Date.now()) : null,
      nextInMs: game.phase === 'result' && game.nextAt ? Math.max(0, game.nextAt - Date.now()) : null,   // auto-start of the next round
      players: [...game.players.entries()].map(([id, p]) => ({
        id, name: p.name, emoji: p.emoji, lives: p.lives, out: p.out, outRound: p.outRound, lostLife: p.lostLife, points: p.points, wins: p.wins, gained: p.gained, bonks: p.bonks,
        group: p.group, gaveUp: p.gaveUp, solved: p.solved, beaten: !!p.beaten,
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
    for (const g of groups) {
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
        cost += game.pairCounts.get(pairKey(g[i], g[j])) || 0;
      // Share the group of three around: anyone who has already been in it costs more
      if (g.length === 3) for (const id of g) cost += 3 * (game.players.get(id)?.trios || 0);
    }
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
    for (const g of best) {
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const k = pairKey(g[i], g[j]); game.pairCounts.set(k, (game.pairCounts.get(k) || 0) + 1);
      }
      if (g.length === 3) for (const id of g) { const p = game.players.get(id); if (p) p.trios = (p.trios || 0) + 1; }
    }
    return best;
  }

  /* ---------- Rounds ---------- */
  function resetMatch() {
    game.matchRound = 0;
    game.pairCounts.clear();
    game.groups = [];
    game.result = null;
    for (const p of [...game.players.values(), ...game.departed.values()]) { p.points = 0; p.wins = 0; p.gained = 0; p.bonks = 0; p.lives = game.startLives; p.out = false; p.outRound = 0; p.lostLife = false; p.trios = 0; p.group = null; p.gaveUp = false; p.solved = false; resetBoardShape(p); }
  }

  function startRound() {
    clearTimers();
    if (game.matchRound === 0) resetMatch();
    const ids = [...game.players.entries()].filter(([, p]) => !(game.mode === 'elim' && p.out)).map(([id]) => id);
    game.groups = drawGroups(ids).map((members, i) => ({ id: i, members, winnerId: null, solvers: [], done: false }));
    for (const p of game.players.values()) { p.group = null; p.gaveUp = false; p.solved = false; p.beaten = false; p.gained = 0; p.lostLife = false; resetBoardShape(p); }
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
    const live = g.members.filter(id => { const p = game.players.get(id); return p && !p.gaveUp && !p.solved && !p.beaten; });
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
    if (game.mode === 'elim') {
      if (!endMatch) takeLives();
      game.result.alive = alivePlayers().length;
      game.result.endedEarly = endMatch && game.result.alive > 1;
      game.phase = endMatch || game.result.alive <= 1 ? 'final' : 'result';
    } else {
      game.result.endedEarly = endMatch && game.matchRound < game.matchRounds;
      game.phase = endMatch || game.matchRound >= game.matchRounds ? 'final' : 'result';
    }
    // Between rounds: once the results are on screen, count down 3 seconds and start the next round
    game.nextAt = 0;
    if (game.phase === 'result') {
      // …and give a just-beaten player's breaking-heart animation (2.2 s) time to finish first
      const heartLeft = game.mode === 'elim' && game.lastBeatenAt ? Math.max(0, 2200 - (Date.now() - game.lastBeatenAt)) : 0;
      const wait = Math.max(reason === 'time' ? OUT_OF_TIME_MS : 0, heartLeft) + NEXT_MS;
      if (!game.hold) scheduleNext(wait);
    }
    broadcast();
  }

  // Start the next round after `wait` ms (unless the host has paused)
  function scheduleNext(wait) {
    game.nextAt = Date.now() + wait;
    game.timers.push(setTimeout(() => { if (game.phase === 'result' && !game.hold && game.players.size >= 2) startRound(); }, wait));
  }

  /* ---------- Elimination mode ---------- */
  const alivePlayers = () => [...game.players.values()].filter(p => !p.out);
  // End of a round: in each group the winner (first to make 24) keeps their lives and everyone
  // else loses one. If nobody in a group made 24, everyone in it loses one. A player on 0 lives is out.
  function takeLives() {
    const before = alivePlayers().length;
    const knocked = [];
    for (const g of game.groups) for (const id of g.members) {
      const p = game.players.get(id);
      if (!p || p.out || id === g.winnerId) continue;
      p.lives -= 1; p.lostLife = true;
      if (p.lives <= 0) { p.lives = 0; p.out = true; p.outRound = game.matchRound; knocked.push(p); }
    }
    // Never knock out everyone at once: if this round would leave nobody, those players stay in on one life
    if (before > 0 && alivePlayers().length === 0) {
      for (const p of knocked) { p.out = false; p.lives = 1; p.outRound = 0; }
      game.result.wipeout = true;
    }
    game.result.knockedOut = knocked.filter(p => p.out).map(p => p.name);
  }
  // A player left or was bonked out: if only one player is still in, the match is over
  function checkLastStanding() {
    if (game.mode !== 'elim' || game.phase === 'lobby' || game.phase === 'final') return false;
    if (alivePlayers().length > 1) return false;
    if (game.phase === 'countdown' || game.phase === 'playing') endRound(true);
    else { clearTimers(); game.phase = 'final'; if (game.result) game.result.endedEarly = false; broadcast(); }
    return true;
  }

  function backToLobby(message) {
    clearTimers();
    game.phase = 'lobby';
    game.hold = false;
    resetMatch();
    game.departed.clear();          // the lobby is open again, so anyone can join
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

  // Move a player's seat from an old connection to a new one (same device reconnecting):
  // their place in this round's group, wins and solves all follow them.
  function moveSeat(oldId, newId, player) {
    game.players.delete(oldId);
    game.players.set(newId, player);
    for (const g of game.groups) {
      g.members = g.members.map(id => (id === oldId ? newId : id));
      if (g.winnerId === oldId) g.winnerId = newId;
      for (const x of g.solvers) if (x.id === oldId) x.id = newId;
    }
    if (game.result) for (const g of game.result.groups) {
      g.members = g.members.map(id => (id === oldId ? newId : id));
      if (g.winnerId === oldId) g.winnerId = newId;
      for (const x of g.solvers) if (x.id === oldId) x.id = newId;
    }
  }

  // A player joins. Each device sends a private token, so a player whose connection drops
  // (phone locks, Wi-Fi blips) gets their own seat back automatically, with their score or lives.
  // The lobby closes once the match starts (so the code can't be passed to another class):
  // after that only returning players can join (by token, or by typing exactly the same name).
  function addPlayer(socket, name, emoji, token) {
    token = typeof token === 'string' ? token.slice(0, 64) : '';
    // 1. The same device is still seated (the server hasn't noticed the old connection drop yet)
    if (token) for (const [oldId, p] of game.players) {
      if (p.token !== token || oldId === socket.id) continue;
      const old = io.sockets.sockets.get(oldId);
      if (old) { old.data.replaced = true; old.disconnect(true); }
      moveSeat(oldId, socket.id, p);
      socket.join(code); attach(socket); broadcast();
      return { ok: true, name: p.name, emoji: p.emoji, id: socket.id, code, rejoined: true };
    }
    if (game.players.size >= MAX_PLAYERS) return { ok: false, error: `This lobby is full (${MAX_PLAYERS} players).` };
    let player, rejoined = false;
    // 2. A player who dropped out during the match comes back (by device token, or by exact name)
    const nameKey = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 16).toLowerCase();
    const key = token && game.departed.has('t:' + token) ? 't:' + token : game.departed.has('n:' + nameKey) ? 'n:' + nameKey : null;
    if (key && game.phase !== 'lobby') {
      player = game.departed.get(key);
      for (const [k, v] of game.departed) if (v === player) game.departed.delete(k);
      player.name = uniqueName(player.name);
      if (token) player.token = token;
      // Their old connection's place in this round's group and results moves to the new one
      game.players.set(player.lastId, player);
      moveSeat(player.lastId, socket.id, player);
      if (game.phase === 'countdown' || game.phase === 'playing') {
        // Still in this round's race? Carry on with it; otherwise they play from the next round
        const g = player.group !== null ? game.groups[player.group] : null;
        if (g && g.members.includes(socket.id)) {
          if (g.done && !player.solved && !player.gaveUp && !player.beaten) g.done = false;
        } else { player.group = null; player.gaveUp = false; player.solved = false; player.gained = 0; resetBoardShape(player); }
      }
      rejoined = true;
      emit('notice', `${player.name} rejoined the game.`);
    } else if (game.phase !== 'lobby') {
      return { ok: false, error: 'This game has already started, so the lobby is closed. If you were already playing, type exactly the same name to rejoin.' };
    } else {
      player = newPlayer(uniqueName(name), emoji);
      player.token = token;
      game.players.set(socket.id, player);
    }
    socket.join(code);
    attach(socket);
    broadcast();
    return { ok: true, name: player.name, emoji: player.emoji, id: socket.id, code, rejoined };
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
      game.hold = false;
      if (game.phase === 'lobby' || game.phase === 'result') startRound();
    });

    // Host only: end the match now. Any race still going stops (points already scored
    // count) and the scoreboard as it stands becomes the final result.
    socket.on('endMatch', () => {
      if (!isHost()) return;
      if (game.phase === 'countdown' || game.phase === 'playing') endRound(true);
      else if (game.phase === 'result') {
        clearTimers();
        game.result.endedEarly = game.mode === 'elim' ? alivePlayers().length > 1 : game.matchRound < game.matchRounds;
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
      if (game.mode === 'elim') {
        // Elimination: a bonk takes a life instead of points (and can knock a player out)
        if (p.out) return reply?.({ ok: false, error: `${p.name} is already out.` });
        p.lives -= 1; p.bonks += 1;
        if (p.lives <= 0) { p.lives = 0; p.out = true; p.outRound = game.matchRound; }
        reply?.({ ok: true, life: true });
        broadcast();
        emit('bonked', { id, name: p.name, life: true, out: p.out });
        if (p.out) {
          const g = p.group !== null && game.groups[p.group];
          if (g && game.phase === 'playing') { p.gaveUp = true; groupFinishedCheck(g); }
          if (!checkLastStanding()) { broadcast(); checkRoundOver(); }
        }
        return;
      }
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
      if (![4, 5].includes(c) || c === game.cardCount) return;   // nothing to change
      game.cardCount = c;
      for (const p of game.players.values()) resetBoardShape(p);
      broadcast();
    });

    // Host only, in the waiting room: points match or elimination (last one standing)
    socket.on('setMode', m => {
      if (!isHost() || game.phase !== 'lobby') return;
      const mode = m === 'elim' ? 'elim' : 'points';
      if (mode === game.mode) return;
      game.mode = mode;
      broadcast();
    });

    // Host only, during a match: pause after this round (the next round waits) or resume.
    // Pausing during a round lets it finish; pausing on the results stops the countdown.
    socket.on('hold', on => {
      if (!isHost() || game.phase === 'lobby' || game.phase === 'final') return;
      game.hold = !!on;
      if (game.phase === 'result') {
        clearTimers(); game.nextAt = 0;
        if (!game.hold) scheduleNext(NEXT_MS);
      }
      broadcast();
    });

    // Host only, in the waiting room: elimination lives (3, 4 or 5)
    socket.on('setLives', n => {
      if (!isHost() || game.phase !== 'lobby') return;
      const lives = Math.max(3, Math.min(5, Math.round(Number(n)) || LIVES));
      if (lives === game.startLives) return;
      game.startLives = lives;
      for (const p of game.players.values()) p.lives = game.startLives;
      broadcast();
    });

    socket.on('setRounds', n => {
      if (!isHost() || game.phase !== 'lobby') return;
      const rounds = Math.max(1, Math.min(MAX_ROUNDS, Math.round(Number(n)) || 5));
      if (rounds === game.matchRounds) return;
      game.matchRounds = rounds;
      broadcast();
    });

    // A player's board changed: which slots hold cards, which card is selected, and the last move.
    socket.on('progress', info => {
      // At most 10 board updates a second per player, so a stuck or misbehaving device can't flood the class
      const now = Date.now();
      socket.data.bucket = Math.min(10, (socket.data.bucket ?? 10) + (now - (socket.data.bucketAt || now)) / 100);
      socket.data.bucketAt = now;
      if (socket.data.bucket < 1) return;
      socket.data.bucket -= 1;
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
      // Only this player's board changed: send just that, and only to the screens that show it
      // (their opponents and the host), instead of the whole game to the whole class
      const g = game.groups[p.group];
      const to = [...(g ? g.members : []), game.hostSocket].filter(id => id && id !== socket.id);
      if (to.length) io.to(to).emit('progress', { id: socket.id, layout: p.layout, sel: p.sel, lastMove: p.lastMove, moveSeq: p.moveSeq });
      game.lastActive = now;
    });

    // moves: the player's moves; clientTime (optional): seconds since the cards appeared, timed on their device
    socket.on('submit', (moves, clientTime, reply) => {
      if (typeof clientTime === 'function') { reply = clientTime; clientTime = undefined; }
      const p = game.players.get(socket.id);
      const g = p && p.group !== null ? game.groups[p.group] : null;
      if (!g || game.phase !== 'playing' || p.gaveUp || p.beaten) return reply?.({ ok: false, error: 'The round is over.' });
      if (p.solved) return reply?.({ ok: false, error: 'You have already made 24 this round.' });
      const expr = checkMoves(game.puzzle.nums, moves);
      if (!expr) return reply?.({ ok: false, error: 'That doesn’t make 24.' });
      // Speed is timed on the player's device, so a slow connection doesn't cost points. The device's time
      // can only be a little less than the server's (the answer took time to arrive), never more, and at
      // most 3 seconds less; anything else falls back to the server's own timing.
      const serverTime = (Date.now() - game.startAt) / 1000;
      const ct = Number(clientTime);
      const time = Number.isFinite(ct) && ct >= 0 && ct <= serverTime + 0.25 && ct >= serverTime - 3 ? Math.min(ct, serverTime) : serverTime;
      const first = !g.winnerId;
      const points = roundPoints(time) + (first ? FIRST_BONUS : 0);
      if (first) { g.winnerId = socket.id; p.wins += 1; }
      // Elimination: once someone in the group makes 24, the race is over for everyone else in it
      if (first && game.mode === 'elim') {
        for (const id of g.members) {
          const q = game.players.get(id);
          if (q && id !== socket.id && !q.solved && !q.gaveUp) { q.beaten = true; game.lastBeatenAt = Date.now(); }
        }
      }
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
      if (!g || game.phase !== 'playing' || p.solved || p.gaveUp || p.beaten) return;
      p.gaveUp = true;
      groupFinishedCheck(g);
      broadcast();
      checkRoundOver();
    });

    socket.on('disconnect', () => {
      if (socket.id === game.hostSocket) { game.hostSocket = null; broadcast(); return; }
      if (socket.data.replaced) return;            // this device already reconnected on a new connection
      const p = game.players.get(socket.id);
      if (!p) return;
      game.players.delete(socket.id);
      if (game.phase !== 'lobby') {                 // may come back: by device token, or by typing the same name
        p.lastId = socket.id;
        if (p.token) game.departed.set('t:' + p.token, p);
        game.departed.set('n:' + p.name.toLowerCase(), p);
      }
      emit('notice', `${p.name} left the game.`);
      if (game.phase !== 'lobby' && game.players.size < 2) return backToLobby('Not enough players left, so the match has ended.');
      if (checkLastStanding()) return;
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

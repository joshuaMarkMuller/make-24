#!/usr/bin/env node
/*
 * Match test: plays whole matches, start to podium, for every game setup at once and checks the rules.
 *
 *   npm run test:matches                         10 matches of each setup, 24 players each (about 10 minutes)
 *   npm run test:matches -- --matches 2          fewer matches
 *
 * Setups: Points with 4 cards, Points with 5 cards, Elimination with 4 cards, Elimination with 5 cards.
 *
 * Options:
 *   --matches N    matches of each setup, all played at the same time (default 10)
 *   --players N    players per match, 2–24 (default 24)
 *   --rounds N     rounds per Points match, 1–10 (default 10)
 *   --lives N      lives per Elimination match, 3–5 (default 3)
 *   --url URL      test a running server (default: starts its own on a spare port)
 *
 * Every player is a simulated device. Most make 24 at some point in each round (answers are found the
 * way a student plays: two cards at a time, in any order, so many need brackets), some give up and some
 * run out of time. Three wins in a row steal from someone. It checks, every round:
 *   - every group's cards are 4 or 5 numbers from 1 to 9, can make 24, and no two groups share a puzzle
 *   - the answer shown for each group really makes 24 from exactly those cards
 *   - every correct answer is accepted (bracket answers included) and a wrong one is refused
 *   - Points: speed points, the first-in-group bonus and every score (allowing for steals)
 *   - Elimination: the winner of each race keeps their lives and everyone else in it loses one
 *     (allowing for steals); out means 0 lives; out players aren't put in races
 * and that every match reaches the final podium by itself: Points after exactly the set number of
 * rounds, Elimination with exactly one player left.
 * Exit code 0 = everything passed, 1 = something failed (listed at the end).
 */
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const MATCHES = Math.max(1, Math.min(12, +arg('matches', 10) || 10));
const PLAYERS = Math.max(2, Math.min(24, +arg('players', 24) || 24));
const ROUNDS = Math.max(1, Math.min(10, +arg('rounds', 10) || 10));
const LIVES = Math.max(3, Math.min(5, +arg('lives', 3) || 3));
let URL = arg('url', '').replace(/\/$/, '');

const SETUPS = [
  { key: 'P4', label: 'Points, 4 cards', mode: 'points', cards: 4 },
  { key: 'P5', label: 'Points, 5 cards', mode: 'points', cards: 5 },
  { key: 'E4', label: 'Elimination, 4 cards', mode: 'elim', cards: 4 },
  { key: 'E5', label: 'Elimination, 5 cards', mode: 'elim', cards: 5 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const log = (...a) => console.log(ts(), ...a);
const issues = [];
const fail = m => { if (issues.length < 500) issues.push(m); log('FAIL', m); };

/* ---------- Maths helpers (independent of the game's own solver) ---------- */
const OPS = ['+', '−', '×', '÷'];
const doOp = (op, x, y) => op === '+' ? x + y : op === '−' ? x - y : op === '×' ? x * y : (y === 0 || x % y ? null : x / y);
// Every way to play the cards (two at a time, whole numbers only); returns the moves for one answer, chosen at random
function findMoves(nums) {
  const all = [];
  (function rec(sl, moves) {
    if (all.length >= 60) return;
    const idx = sl.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
    if (idx.length === 1) { if (sl[idx[0]] === 24) all.push(moves); return; }
    for (const a of idx) for (const b of idx) { if (a === b) continue; for (const op of OPS) {
      const v = doOp(op, sl[a], sl[b]); if (v == null) continue;
      const n = [...sl]; n[b] = v; n[a] = null; rec(n, [...moves, { a, b, op }]); } }
  })(nums, []);
  return all.length ? all[Math.floor(Math.random() * all.length)] : null;
}
// A one-line answer with no brackets, worked out with the normal order of operations (the old puzzle rule)
function solvableWithoutBrackets(nums) {
  const perms = []; (function p(a, r) { if (!r.length) perms.push(a); r.forEach((x, i) => p([...a, x], r.filter((_, j) => j !== i))); })([], nums);
  for (const p of perms) for (let k = 0; k < 4 ** (nums.length - 1); k++) {
    const ops = []; for (let i = 0, x = k; i < nums.length - 1; i++, x >>= 2) ops.push(OPS[x & 3]);
    const terms = [p[0]], signs = ['+']; let okk = true;
    for (let i = 0; i < ops.length; i++) { const op = ops[i], n = p[i + 1];
      if (op === '×') terms[terms.length - 1] *= n;
      else if (op === '÷') { const t = terms[terms.length - 1]; if (t % n) { okk = false; break } terms[terms.length - 1] = t / n; }
      else { terms.push(n); signs.push(op); } }
    if (!okk) continue;
    let v = terms[0]; for (let i = 1; i < terms.length; i++) v = signs[i] === '+' ? v + terms[i] : v - terms[i];
    if (v === 24) return true;
  }
  return false;
}
// Check a written answer: uses exactly these cards and makes 24
function answerMakes24(expr, nums) {
  const used = (expr.match(/\d+/g) || []).map(Number).sort((a, b) => a - b).join();
  if (used !== [...nums].sort((a, b) => a - b).join()) return false;
  const v = Function('return ' + expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-'))();
  return Math.abs(v - 24) < 1e-9;
}

/* ---------- Server ---------- */
let serverErrors = 0;
async function startServer() {
  const port = await new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => { serverErrors++; fail('server error: ' + String(d).trim().split('\n')[0]); });
  for (let i = 0; i < 50; i++) {
    const up = await new Promise(res => http.get(`http://localhost:${port}/healthz`, r => res(r.statusCode === 200)).on('error', () => res(false)));
    if (up) return { url: `http://localhost:${port}`, child };
    await sleep(100);
  }
  throw new Error('The server did not start');
}
// Server CPU and memory, sampled while the matches play (Linux only)
function sampleServer(pid) {
  try {
    const st = require('fs').readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const rss = +require('fs').readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024;
    return { cpu: (+st[11] + +st[12]) / 100, rss };
  } catch { return null; }
}

/* ---------- One match ---------- */
function connect() { return io(URL, { transports: ['websocket'], forceNew: true }); }
const emitAck = (s, ev, ...a) => new Promise(res => s.emit(ev, ...a, res));

async function playMatch(setup, n) {
  const M = { setup, n, name: `${setup.key}-${n}`, rounds: [], puzzles: 0, bracketPuzzles: 0, bracketAnswers: 0, answers: 0, steals: 0,
    pts: new Map(), wrongRefused: 0, done: null };
  const host = connect();
  await new Promise(r => host.once('connect', r));
  const cr = await emitAck(host, 'createLobby');
  if (!cr.ok) { fail(`${M.name}: couldn't create a lobby: ${cr.error}`); return M; }
  M.code = cr.code;
  host.emit('setMode', setup.mode); host.emit('setCards', setup.cards);
  if (setup.mode === 'points') host.emit('setRounds', ROUNDS); else host.emit('setLives', LIVES);

  let state = null, lastResultRound = 0, livesAtStart = null, stolenLives = new Map();
  const finished = new Promise(res => { M.finish = res; });
  host.on('state', st => {
    state = st;
    if (st.phase === 'playing' && livesAtStart === null) {
      livesAtStart = new Map(st.players.map(p => [p.name, { lives: p.lives, out: p.out }]));
      stolenLives = new Map();
      // Out players aren't put in races
      const inRace = new Set(st.groups.flatMap(g => g.members));
      for (const p of st.players) if (st.mode === 'elim' && p.out && inRace.has(p.id)) fail(`${M.name} round ${st.matchRound}: ${p.name} is out but was put in a race`);
    }
    if ((st.phase === 'result' || st.phase === 'final') && st.result && st.round !== lastResultRound) {
      lastResultRound = st.round;
      checkRound(M, st, livesAtStart, stolenLives);
      livesAtStart = null;
    }
    if (st.phase === 'final' && !M.done) { M.done = st; M.finish(); }
  });
  host.on('stolen', d => {
    M.steals++;
    if (d.life) { stolenLives.set(d.byName, (stolenLives.get(d.byName) || 0) + 1); stolenLives.set(d.fromName, (stolenLives.get(d.fromName) || 0) - 1); }
    else { M.pts.set(d.byName, (M.pts.get(d.byName) || 0) + d.amount); M.pts.set(d.fromName, (M.pts.get(d.fromName) || 0) - d.amount); }
  });
  // Steals happen between rounds, so the lives "at the start" are taken when the next round begins (after them)

  const sims = [];
  for (let i = 1; i <= PLAYERS; i++) sims.push(await simPlayer(M, `${setup.key}${n}-Kid${String(i).padStart(2, '0')}`));
  await sleep(300);
  host.emit('start');
  log(`${M.name}: lobby ${M.code} started (${setup.label}, ${PLAYERS} players)`);
  const limit = setup.mode === 'points' ? ROUNDS * 60000 + 60000 : 40 * 60000;
  const timer = setTimeout(() => { fail(`${M.name}: the match didn't reach the podium in time (stuck in "${state && state.phase}" on round ${state && state.matchRound})`); M.finish(); }, limit);
  await finished; clearTimeout(timer);
  checkFinal(M, M.done || state);
  for (const s of sims) s.s.close(); host.close();
  log(`${M.name}: finished after ${M.rounds.length} rounds`);
  return M;
}

function simPlayer(M, name) {
  const s = connect();
  const me = { s, name, timers: [] };
  s.on('state', st => {
    me.state = st;
    const mine = st.players.find(p => p.id === me.id);
    if (st.phase !== 'result' || !mine || !mine.canSteal || me.stealing) return;
    me.stealing = true;
    setTimeout(() => {
      const cur = me.state, elim = cur.mode === 'elim', meNow = cur.players.find(p => p.id === me.id);
      const targets = cur.players.filter(t => t.id !== me.id && (elim ? !t.out && t.lives >= 2 : t.points > 0));
      if (!targets.length || cur.phase !== 'result' || !meNow || !meNow.canSteal) return;
      s.emit('steal', targets[Math.floor(Math.random() * targets.length)].id, r => { if (!r.ok) fail(`${M.name}: ${name}'s steal refused: ${r.error}`); });
    }, rand(300, 2000));
  });
  s.on('round', r => {
    me.timers.forEach(clearTimeout); me.timers = []; me.stealing = false;
    const startAt = Date.now() + r.countdownMs;
    const moves = findMoves(r.nums);
    if (!moves) { fail(`${M.name}: ${name} was dealt cards that can't make 24: ${r.nums}`); return; }
    const at = (ms, f) => me.timers.push(setTimeout(f, r.countdownMs + ms));
    // Now and then, a wrong answer first (should be refused)
    if (Math.random() < 0.05) at(rand(500, 1500), () => {
      const bad = moves.map(m => ({ ...m })); bad[bad.length - 1].op = bad[bad.length - 1].op === '+' ? '×' : '+';
      const sl = [...r.nums]; for (const m of bad) { const v = sl[m.a] == null || sl[m.b] == null ? null : doOp(m.op, sl[m.a], sl[m.b]); sl[m.b] = v; sl[m.a] = null; }
      const reallyWrong = sl.filter(v => v != null).length !== 1 || sl.find(v => v != null) !== 24;
      if (!reallyWrong) return;   // changing the last operation happened to make 24 anyway
      s.emit('submit', bad, Math.max(0, (Date.now() - startAt) / 1000), res => { if (res && res.ok) fail(`${M.name}: ${name}'s wrong answer was accepted`); else M.wrongRefused++; });
    });
    const roll = Math.random();
    if (roll < 0.75) at(rand(2000, 26000), () => s.emit('submit', moves, Math.max(0, (Date.now() - startAt) / 1000), res => {
      if (res && !res.ok && !/already made 24|round is over/.test(res.error)) fail(`${M.name}: ${name}'s answer to ${r.nums} was refused: ${res.error}`);
    }));
    else if (roll < 0.85) at(rand(3000, 20000), () => s.emit('giveUp'));
  });
  return new Promise(res => s.once('connect', () => s.emit('join', { code: M.code, name }, r => {
    if (!r.ok) fail(`${M.name}: ${name} couldn't join: ${r.error}`); else me.id = r.id;
    res(me);
  })));
}

/* ---------- Checks ---------- */
function checkRound(M, st, livesAtStart, stolenLives) {
  const R = `${M.name} round ${st.matchRound}`, cards = M.setup.cards;
  const res = st.result;
  M.rounds.push({ round: st.matchRound, solved: res.solvedCount, players: st.groups.flatMap(g => g.members).length });
  const keys = res.groups.map(g => [...g.nums].sort((a, b) => a - b).join());
  if (new Set(keys).size !== keys.length) fail(`${R}: two groups had the same puzzle`);
  for (const g of res.groups) {
    M.puzzles++;
    if (g.nums.length !== cards || g.nums.some(x => !Number.isInteger(x) || x < 1 || x > 9)) fail(`${R}: bad cards ${g.nums}`);
    if (!g.solution || !answerMakes24(g.solution, g.nums)) fail(`${R}: the answer shown for ${g.nums} is wrong: "${g.solution}"`);
    const needsBrackets = !solvableWithoutBrackets(g.nums);
    if (needsBrackets) { M.bracketPuzzles++; if (!g.solution.includes('(')) fail(`${R}: ${g.nums} needs brackets but the answer shown has none: "${g.solution}"`); }
    if (g.solvers.filter(x => x.first).length > 1) fail(`${R}: two winners in one race`);
    for (const x of g.solvers) {
      M.answers++; if (x.expr.includes('(')) M.bracketAnswers++;
      if (!answerMakes24(x.expr, g.nums)) fail(`${R}: ${x.name}'s accepted answer "${x.expr}" doesn't make 24 from ${g.nums}`);
      if (!g.members.includes(x.id)) fail(`${R}: ${x.name} scored in a race they weren't in`);
      if (M.setup.mode === 'points') {
        const expect = Math.round(1000 - 500 * Math.min(x.time, 30) / 30) + (x.first ? 100 : 0);
        if (x.points !== expect) fail(`${R}: ${x.name} got ${x.points} points, expected ${expect}`);
        M.pts.set(x.name, (M.pts.get(x.name) || 0) + x.points);
      }
    }
  }
  if (M.setup.mode === 'points') {
    for (const p of st.players) { const exp = M.pts.get(p.name) || 0; if (p.points !== exp) fail(`${R}: ${p.name} has ${p.points} points, expected ${exp}`); }
  } else if (livesAtStart) {
    const winners = new Set(res.groups.map(g => g.winnerId).filter(Boolean));
    const raced = new Set(res.groups.flatMap(g => g.members));
    for (const p of st.players) {
      const was = livesAtStart.get(p.name); if (!was) continue;
      let exp = was.lives;
      if (raced.has(p.id) && !winners.has(p.id)) exp = Math.max(0, exp - 1);
      if (res.wipeout && exp === 0 && p.lives === 1) exp = 1;   // nobody gets knocked out all at once
      if (p.lives !== exp) fail(`${R}: ${p.name} has ${p.lives} lives, expected ${exp}`);
      if ((p.lives === 0) !== p.out) fail(`${R}: ${p.name} has ${p.lives} lives but out is ${p.out}`);
      if (p.lives > LIVES) fail(`${R}: ${p.name} has more lives than they started with (${p.lives})`);
    }
  }
}
function checkFinal(M, st) {
  M.final = st;
  if (!st || st.phase !== 'final') return;
  if (st.result && st.result.endedEarly) fail(`${M.name}: the match ended early`);
  if (M.setup.mode === 'points') {
    if (st.matchRound !== ROUNDS) fail(`${M.name}: the match ended after ${st.matchRound} rounds, not ${ROUNDS}`);
    const top = [...st.players].sort((a, b) => b.points - a.points);
    M.winner = `${top[0].name} (${top[0].points})`;
  } else {
    const alive = st.players.filter(p => !p.out);
    if (alive.length !== 1) fail(`${M.name}: the match ended with ${alive.length} players still in`);
    M.winner = alive[0] ? `${alive[0].name} (${alive[0].lives} ${alive[0].lives === 1 ? 'life' : 'lives'} left)` : 'nobody';
  }
}

/* ---------- Run ---------- */
(async () => {
  let server = null;
  if (!URL) { server = await startServer(); URL = server.url; }
  console.log(`Match test: ${MATCHES} matches of each setup (${SETUPS.map(s => s.label).join('; ')}), ${PLAYERS} players each, all at once, at ${URL}\n`);
  let peak = { cpu: 0, rss: 0 }, last = server && sampleServer(server.child.pid), lastT = Date.now();
  const sampler = server && setInterval(() => {
    const s = sampleServer(server.child.pid); if (!s || !last) return;
    const cpu = (s.cpu - last.cpu) / ((Date.now() - lastT) / 1000) * 100; last = s; lastT = Date.now();
    peak.cpu = Math.max(peak.cpu, cpu); peak.rss = Math.max(peak.rss, s.rss);
  }, 5000);
  const jobs = [];
  for (const setup of SETUPS) for (let n = 1; n <= MATCHES; n++) { jobs.push(playMatch(setup, n)); await sleep(150); }
  const all = await Promise.all(jobs);
  if (sampler) clearInterval(sampler);

  console.log('\n================ RESULTS ================');
  for (const setup of SETUPS) {
    const ms = all.filter(m => m.setup === setup);
    const rounds = ms.map(m => m.rounds.length), puzzles = ms.reduce((a, m) => a + m.puzzles, 0), br = ms.reduce((a, m) => a + m.bracketPuzzles, 0);
    const answers = ms.reduce((a, m) => a + m.answers, 0), brA = ms.reduce((a, m) => a + m.bracketAnswers, 0), steals = ms.reduce((a, m) => a + m.steals, 0);
    const finished = ms.filter(m => m.final && m.final.phase === 'final').length;
    console.log(`\n${setup.label}: ${finished}/${ms.length} matches reached the podium`);
    console.log(`  rounds per match: ${rounds.join(', ')}`);
    console.log(`  puzzles dealt: ${puzzles}, of which ${br} (${(100 * br / Math.max(1, puzzles)).toFixed(0)}%) need brackets`);
    console.log(`  correct answers accepted: ${answers}, of which ${brA} used brackets · steals: ${steals} · wrong answers refused: ${ms.reduce((a, m) => a + m.wrongRefused, 0)}`);
    console.log(`  winners: ${ms.map(m => m.winner || '—').join('; ')}`);
  }
  if (server) console.log(`\nServer: peak ${peak.cpu.toFixed(0)}% of one CPU core, peak memory ${peak.rss.toFixed(0)} MB, ${serverErrors} errors`);
  if (server) server.child.kill();
  console.log(issues.length ? `\n${issues.length} PROBLEM${issues.length > 1 ? 'S' : ''}:\n` + issues.slice(0, 50).map(m => '  - ' + m).join('\n') : '\nEverything passed.');
  process.exit(issues.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

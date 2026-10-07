#!/usr/bin/env node
/*
 * Class test: plays whole classes of Make 24 at the same time and checks nothing breaks.
 *
 *   npm run test:class                                  2 classes × 24 players × 10 rounds (about 7 minutes)
 *   npm run test:class -- --classes 3 --rounds 5        any mix of options below
 *
 * Options:
 *   --classes N    classes playing at once (default 2)
 *   --players N    players per class, 16–24 (default 24)
 *   --rounds N     rounds per match, 1–10 (default 10; the full set of checks needs 8 or more)
 *   --url URL      test a running server, e.g. the live site (default: starts its own on a spare port)
 *   --shots DIR    save screenshots of the host and player screens to DIR
 *
 * Each class has a host screen and two players in real (headless) browsers, one laptop-sized
 * and one phone-sized; the rest are simulated phones. While the matches play, it:
 *   - checks every round: groups, speed points, scores, nobody seeing another class's game
 *   - drops connections (one phone, five at once, ten at once), reloads a page mid-round,
 *     tries to take a playing student's seat from another device, and has a phone leave and come back between rounds
 *   - tries to join mid-match with a new name and with someone else's name
 *   - pauses (mid-round and on the results), resumes, and starts the next round early
 *   - bonks with one press (should only arm), two presses, and lets an armed Bonk time out
 *   - checks the player help, the "Host a Game" button, and that ranks are hidden while everyone is level
 *   - floods card taps (only 10 a second get through, only to opponents and the host) and checks the
 *     scoreboard isn't redrawn when only the face-down cards change
 *   - times answers on the "device", including one that arrives late over a slow connection
 *   - simulated phones that win three races in a row steal from someone (or let the steal run out),
 *     and the scores are checked to allow for every steal
 * Four small extra classes play alongside: C, 7 players (odd, so the group of three is checked to be
 * shared around); D, Elimination, where a knocked-out browser player keeps practising on the same cards;
 * E and F, three players each (Points and Elimination), where a browser player wins three races in a row,
 * steals with the real buttons, and the terminal window shows "… beats … and …".
 *
 * Needs:  npm install   and, once,   npx playwright install chromium
 * (or set CHROME_PATH to a Chrome/Chromium to use instead)
 * Exit code 0 = everything passed, 1 = something failed (listed at the end).
 */
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');
const { spawn } = require('child_process');
let chromium, io;
try { ({ chromium } = require('playwright')); ({ io } = require('socket.io-client')); }
catch { console.error('Missing test tools. Run:  npm install  then  npx playwright install chromium'); process.exit(1); }

/* ---------- Options ---------- */
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const CLASSES = Math.max(1, Math.min(10, +arg('classes', 2) || 2));
const PLAYERS = Math.max(16, Math.min(24, +arg('players', 24) || 24));
const ROUNDS = Math.max(1, Math.min(10, +arg('rounds', 10) || 10));
const SHOTS = arg('shots', '');
let URL = arg('url', '').replace(/\/$/, '');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's';
const log = (...a) => console.log(ts(), ...a);
const issues = [], passes = [], skipped = [];
const fail = m => { issues.push(m); log('FAIL', m); };
const ok = (cond, m) => { if (cond) { passes.push(m); log('pass', m); } else fail(m); };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {}); };

// Every way to make 24 from these cards, using the game's rules (whole numbers only)
function findMoves(nums) {
  function rec(sl, moves) {
    const idx = sl.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
    if (idx.length === 1) return sl[idx[0]] === 24 ? moves : null;
    for (const a of idx) for (const b of idx) { if (a === b) continue; for (const op of ['+', '−', '×', '÷']) {
      const x = sl[a], y = sl[b]; let v;
      if (op === '+') v = x + y; else if (op === '−') v = x - y; else if (op === '×') v = x * y; else { if (y === 0 || x % y) continue; v = x / y; }
      const n = [...sl]; n[b] = v; n[a] = null; const r = rec(n, [...moves, { a, b, op }]); if (r) return r; } }
    return null;
  }
  return rec(nums, []);
}
const opKey = { '+': '+', '−': '-', '×': '*', '÷': '/' };

/* ---------- Server ---------- */
async function startServer() {
  const port = await new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => fail('server error: ' + String(d).trim().split('\n')[0]));
  for (let i = 0; i < 50; i++) {
    const up = await new Promise(res => http.get(`http://localhost:${port}/healthz`, r => res(r.statusCode === 200)).on('error', () => res(false)));
    if (up) return { url: `http://localhost:${port}`, child };
    await sleep(100);
  }
  throw new Error('The server did not start');
}

(async () => {
  let server = null;
  if (!URL) { server = await startServer(); URL = server.url; }
  console.log(`Class test: ${CLASSES} class${CLASSES > 1 ? 'es' : ''} × ${PLAYERS} players × ${ROUNDS} rounds at ${URL}\n`);

  let browser;
  try { browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}); }
  catch (e) {
    if (server) server.child.kill();
    console.error(/Executable doesn't exist/.test(e.message) ? 'The test browser is missing. Run:  npx playwright install chromium' : 'Could not start the test browser: ' + e.message.split('\n')[0]);
    process.exit(1);
  }
  const pageErrs = [];
  const page = async (w, h) => { const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    p.on('pageerror', e => pageErrs.push(e.message)); p.on('console', m => { if (m.type() === 'error') pageErrs.push('console: ' + m.text()); }); return p; };
  const LOBBIES = Array.from({ length: CLASSES }, (_, i) => ({ name: String.fromCharCode(65 + i), cards: i % 2 ? 5 : 4 }));

  /* ---------- Simulated phones ---------- */
  function simPlayer(L, name) {
    const token = 'test' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnectionDelay: 300, reconnectionDelayMax: 1000 });
    const me = { s, name, L, token, timers: [], joins: 0, codesSeen: new Set(), rejoinedCount: 0, progressIn: 0, statesIn: 0 };
    // A full game update where nothing changed except someone's face-down cards is wasted (change 13 stops these)
    const gist = st => JSON.stringify({ ...st, timeLeftMs: 0, nextInMs: 0, players: st.players.map(({ layout, sel, moveSeq, lastMove, ...rest }) => rest) });
    // Three wins in a row: most phones steal from someone after a moment; some let the steal run out
    s.on('state', st => {
      const mine = st.players.find(p => p.id === me.id);
      if (st.phase !== 'result' || !mine || !mine.canSteal || me.stealing || me.manual || me.onRound) return;
      me.stealing = true;
      if (Math.random() < 0.2) { L.stealsLapsed = (L.stealsLapsed || 0) + 1; return; }
      setTimeout(() => {
        const cur = me.state, elim = cur.mode === 'elim';
        const targets = cur.players.filter(t => t.id !== me.id && (elim ? !t.out && t.lives >= 2 : t.points > 0));
        const meNow = cur.players.find(p => p.id === me.id);
        if (!targets.length || cur.phase !== 'result' || !meNow || !meNow.canSteal) return;   // the round moved on
        const t = targets[Math.floor(Math.random() * targets.length)];
        s.emit('steal', t.id, res => { if (!res.ok) fail(`${L.name}: ${name}'s steal refused: ${res.error}`); else L.steals = (L.steals || 0) + 1; });
      }, rand(500, 4000));
    });
    s.on('state', st => { const k = gist(st); if (k === me.lastGist) { me.cardOnlyStates = (me.cardOnlyStates || 0) + 1; } me.lastGist = k; me.state = st; me.statesIn++; me.codesSeen.add(st.code); if (me.observer) observe(L, st); });
    // Steals change the scores, so the class's checker keeps track of them
    s.on('stolen', d => {
      if (!me.observer) return;
      if (!d.life) {
        if (!(d.amount >= 0 && d.amount <= 300)) fail(`${L.name}: a steal took ${d.amount} points`);
        L.adj = L.adj || new Map();
        L.adj.set(d.byName, (L.adj.get(d.byName) || 0) + d.amount); L.adj.set(d.fromName, (L.adj.get(d.fromName) || 0) - d.amount);
      }
      const victim = me.state && me.state.players.find(p => p.id === d.from);
      if (victim && (victim.points < 0 || victim.lives < 1)) fail(`${L.name}: a steal left ${d.fromName} with ${victim.points} points / ${victim.lives} lives`);
    });
    // Board updates should only come from my own opponents
    s.on('progress', d => {
      me.progressIn++; me.from = me.from || {}; me.from[d.id] = (me.from[d.id] || 0) + 1;
      const st = me.state, g = st && st.groups.find(g => g.members.includes(me.id));
      if (st && st.phase === 'playing' && (!g || !g.members.includes(d.id))) { me.strayProgress = (me.strayProgress || 0) + 1; }
    });
    s.on('disconnect', () => { s.sendBuffer = []; });
    s.on('round', r => {
      me.timers.forEach(clearTimeout); me.timers = []; me.moves = findMoves(r.nums); me.startAt = Date.now() + r.countdownMs; me.stealing = false;
      if (me.onRound) return me.onRound(r);
      if (me.manual) return;   // this phone is being driven by a check
      if (!me.moves) fail(`${L.name}: unsolvable puzzle ${r.nums}`);
      const at = (ms, f) => me.timers.push(setTimeout(f, r.countdownMs + ms));
      for (let k = 0; k < 3; k++) at(rand(400, 6000), () => s.emit('progress', { layout: r.nums.map(() => true), sel: Math.floor(Math.random() * r.nums.length) }));
      const roll = Math.random();
      if (roll < 0.75) at(rand(1500, 25000), () => me.submit());          // most make 24 at some point
      else if (roll < 0.85) at(rand(3000, 20000), () => s.emit('giveUp')); // some give up
      // the rest run out of time
    });
    me.elapsed = () => Math.max(0, (Date.now() - me.startAt) / 1000);   // timed on the "device"
    me.submit = (time = me.elapsed()) => s.emit('submit', me.moves, time, res => { if (res && !res.ok && !/already made 24|round is over/.test(res.error)) fail(`${L.name} ${name}: answer refused: ${res.error}`); });
    me.join = () => new Promise(res => s.emit('join', { code: L.code, name, token }, r => {
      me.joins++;
      if (!r.ok) fail(`${L.name}: ${name} couldn't join: ${r.error}`);
      else { if (r.name !== name) fail(`${L.name}: ${name} came back as ${r.name}`); me.id = r.id; if (r.rejoined) me.rejoinedCount++; }
      res(r);
    }));
    s.on('connect', () => { if (me.joins > 0) me.join(); });   // like the real player screen: rejoin automatically
    return new Promise(res => s.once('connect', async () => { await me.join(); res(me); }));
  }

  /* ---------- Every round, check the class's game ---------- */
  function observe(L, st) {
    if (st.code !== L.code) fail(`${L.name}: received another class's game (${st.code})`);
    const last = L.timeline[L.timeline.length - 1];
    if (!last || last.phase !== st.phase || last.round !== st.matchRound || last.hold !== st.hold || last.n !== st.players.length)
      L.timeline.push({ t: Date.now(), phase: st.phase, round: st.matchRound, hold: st.hold, n: st.players.length });
    const names = st.players.map(p => p.name);
    if (new Set(names).size !== names.length) fail(`${L.name} round ${st.matchRound}: the same name appears twice`);
    if ((st.phase === 'result' || st.phase === 'final') && st.result && !L.seen.has(st.round)) {
      L.seen.add(st.round);
      const inGroups = st.groups.flatMap(g => g.members), sizes = st.groups.map(g => g.members.length);
      if (new Set(inGroups).size !== inGroups.length) fail(`${L.name} round ${st.matchRound}: a player is in two groups`);
      if (sizes.some(n => n < 2 || n > 3) || sizes.filter(n => n === 3).length > 1) fail(`${L.name} round ${st.matchRound}: bad group sizes ${sizes}`);
      for (const g of st.result.groups) {
        if (g.solvers.filter(y => y.first).length > 1) fail(`${L.name} round ${st.matchRound}: two winners in one race`);
        for (const x of g.solvers) {
          const expect = Math.round(1000 - 500 * Math.min(x.time, 30) / 30) + (x.first ? 100 : 0);
          if (x.points !== expect) fail(`${L.name} round ${st.matchRound}: ${x.name} got ${x.points} points, expected ${expect}`);
          if (x.time > 30.05) fail(`${L.name} round ${st.matchRound}: an answer counted after the time limit (${x.time} s)`);
          if (!g.members.includes(x.id)) fail(`${L.name} round ${st.matchRound}: ${x.name} scored in a race they weren't in`);
          L.solverPts.set(x.name, (L.solverPts.get(x.name) || 0) + x.points);
        }
      }
      L.trios = L.trios || new Map();
      for (const g of st.groups) if (g.members.length === 3) for (const id of g.members) { const n = st.players.find(p => p.id === id)?.name; if (n) L.trios.set(n, (L.trios.get(n) || 0) + 1); }
      L.rounds.push({ round: st.matchRound, players: st.players.length, solved: st.result.solvedCount });
      for (const p of st.players) {
        const exp = (L.solverPts.get(p.name) || 0) + ((L.adj && L.adj.get(p.name)) || 0) - (L.bonkTaken.get(p.name) || 0);
        if (p.points !== exp) fail(`${L.name} round ${st.matchRound}: ${p.name} has ${p.points} points, expected ${exp}`);
      }
    }
  }

  /* ---------- Set up every class ---------- */
  for (const L of LOBBIES) {
    L.host = await page(1366, 768);
    await L.host.goto(URL + '/host.html');
    await L.host.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.getElementById('lobbyCode').textContent));
    L.code = await L.host.textContent('#lobbyCode');
    L.timeline = []; L.seen = new Set(); L.solverPts = new Map(); L.bonkTaken = new Map(); L.rounds = [];
    log(`class ${L.name}: lobby ${L.code}`);
  }
  for (const L of LOBBIES) {
    L.sims = [];
    for (let i = 1; i <= PLAYERS - 2; i++) L.sims.push(await simPlayer(L, `${L.name}-Kid${String(i).padStart(2, '0')}`));
    L.sims[0].observer = true;
    L.bp = [];
    for (const [k, vp] of [[1, [1000, 700]], [2, [390, 740]]]) {   // a laptop, then a second tab in the same browser (phone-sized)
      let p;
      if (k === 1) p = await page(...vp);
      else { p = await L.bp[0].context().newPage(); await p.setViewportSize({ width: vp[0], height: vp[1] }); p.on('pageerror', e => pageErrs.push(e.message)); }
      await p.goto(URL + '/');
      if (k === 1) {
        ok(await p.getAttribute('#hostBtn', 'href') === '/host.html' && /Host a Game/.test(await p.textContent('#hostBtn')), `${L.name}: "Host a Game" button is on the join screen`);
        await p.keyboard.press('F1'); await sleep(150);
        const h = await p.evaluate(() => { const d = document.querySelector('#helpDlg .dialog').getBoundingClientRect(); return { shown: document.getElementById('helpDlg').classList.contains('show'), fits: d.top >= 0 && d.bottom <= innerHeight, text: document.querySelector('#helpDlg').innerText }; });
        ok(h.shown && h.fits && /lobby code/.test(h.text) && /emoji/.test(h.text) && /Elimination/.test(h.text) && /Give Up/.test(h.text), `${L.name}: player help opens, fits the screen, and covers the code, emoji, both modes and giving up`);
        await p.keyboard.press('Escape');
      }
      await p.fill('#codeInput', L.code); await p.fill('#nameInput', `${L.name}-Browser${k}`); await p.click('button[type=submit]');
      await p.waitForFunction(() => R.myId);
      L.bp.push(p);
    }
    await shot(L.host, `${L.name}-host-waiting-room`);
  }
  for (const L of LOBBIES) { const n = await L.host.evaluate(() => H.state.players.length); ok(n === PLAYERS, `${L.name}: all ${PLAYERS} players in the waiting room, including two tabs in the same browser (${n})`); }
  { const L = LOBBIES[0], sp = L.sims[3];
    sp.s.io.engine.close(); await sleep(2500);
    const names = await L.host.evaluate(() => H.state.players.map(p => p.name));
    ok(names.length === PLAYERS && names.includes(sp.name), `${L.name}: a phone that drops in the waiting room comes back as itself, not a duplicate`); }

  /* ---------- Two small extra classes ----------
   * C: 7 players (odd), Points: the group of three should be shared around.
   * D: 10 players, Elimination with 3 lives: a browser player who's knocked out keeps practising. */
  const EXTRAS = [{ name: 'C', cards: 4, mode: 'points', sims: 7 }, { name: 'D', cards: 4, mode: 'elim', sims: 9, browser: true },
    { name: 'E', cards: 4, mode: 'points', sims: 2, browser: true, matchRounds: 4, streaker: true }, { name: 'F', cards: 4, mode: 'elim', sims: 2, browser: true, lives: 5, streaker: true }];
  for (const L of EXTRAS) {
    L.host = await page(1366, 768); await L.host.goto(URL + '/host.html');
    await L.host.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.getElementById('lobbyCode').textContent));
    L.code = await L.host.textContent('#lobbyCode');
    L.timeline = []; L.seen = new Set(); L.solverPts = new Map(); L.bonkTaken = new Map(); L.rounds = [];
    L.simsList = [];
    for (let i = 1; i <= L.sims; i++) L.simsList.push(await simPlayer(L, `${L.name}-Kid${String(i).padStart(2, '0')}`));
    if (L.streaker) {
      // Kid01 never answers; Kid02 answers after 8 seconds (so it has points to steal); the browser answers first
      L.simsList[0].onRound = () => {};
      L.simsList[1].onRound = r => { L.simsList[1].timers.push(setTimeout(() => L.simsList[1].submit(), r.countdownMs + 8000)); };
    }
    L.simsList[0].observer = true;
    if (L.browser) {
      L.bpx = await page(1000, 700); L.bpx.paused = true;   // never answers, so it gets knocked out
      await L.bpx.goto(URL + '/'); await L.bpx.fill('#codeInput', L.code); await L.bpx.fill('#nameInput', `${L.name}-Browser`); await L.bpx.click('button[type=submit]');
      await L.bpx.waitForFunction(() => R.myId);
    }
    await L.host.selectOption('#hMode', L.mode); await sleep(150);
    if (L.mode === 'points') await L.host.selectOption('#hRounds', String(L.matchRounds || ROUNDS));
    if (L.lives) await L.host.selectOption('#hLives', String(L.lives));
    await L.host.selectOption('#hCardCount', String(L.cards));
    log(`extra class ${L.name}: lobby ${L.code}, ${L.sims + (L.browser ? 1 : 0)} players, ${L.mode === 'elim' ? 'Elimination' : 'Points'}`);
  }

  /* ---------- Start every match ---------- */
  for (const L of LOBBIES) { await L.host.selectOption('#hRounds', String(ROUNDS)); await L.host.selectOption('#hCardCount', String(L.cards)); }
  await sleep(300);
  for (const L of [...LOBBIES, ...EXTRAS]) await L.host.click('#hStart');
  log(`all ${CLASSES} matches started`);
  await sleep(1500);
  for (const L of LOBBIES) {
    const ranks = await L.host.$$eval('#hScores .sb-rank', e => e.map(x => x.textContent));
    ok(ranks.length === PLAYERS && ranks.every(r => r === ''), `${L.name}: no ranks on the scoreboard while everyone is on 0`);
    const panel = await L.bp[0].textContent('#scorePanel');
    ok(panel === 'Score: 0', `${L.name}: player status bar shows "Score: 0" with no rank at the start`);
  }

  // The browser players make 24 each round with the keyboard, like a student would
  async function browserLoop(L, p, idx) {
    let lastSeq = 0;
    while (!L.done) {
      try {
        const st = await p.evaluate(() => R.state && R.me && { phase: R.state.phase, round: R.state.round, ok: !!canPlay() });
        if (st && st.phase === 'playing' && st.ok && st.round !== lastSeq && !p.paused) {
          lastSeq = st.round;
          await sleep(rand(1500, 9000));
          if (p.paused) continue;
          const mv = findMoves(await p.evaluate(() => R.nums)); let sel = null;
          for (const m of mv) { if (p.paused) break; if (sel !== m.a) await p.keyboard.press(String(m.a + 1)); await p.keyboard.press(opKey[m.op]); await p.keyboard.press(String(m.b + 1)); sel = m.b; await sleep(70); }
        }
      } catch (e) { if (!/context was destroyed|navigation|Target page/.test(e.message)) fail(`${L.name} browser ${idx}: ${e.message.split('\n')[0]}`); }
      await sleep(250);
    }
  }
  for (const L of LOBBIES) L.bp.forEach((p, i) => browserLoop(L, p, i + 1));

  // Server load (only when this test started the server)
  const load = [];
  let lastTicks = null, lastT = 0;
  const loadTimer = server && fs.existsSync(`/proc/${server.child.pid}/stat`) ? setInterval(() => { try {
    const f = fs.readFileSync(`/proc/${server.child.pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const ticks = +f[11] + +f[12], now = Date.now();
    const rss = +fs.readFileSync(`/proc/${server.child.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024;
    if (lastTicks != null) load.push({ rss, cpu: (ticks - lastTicks) / ((now - lastT) / 1000) });
    lastTicks = ticks; lastT = now;
  } catch {} }, 2000) : null;

  const waitRound = async (L, round, phase) => { while (!L.timeline.some(x => x.round === round && x.phase === phase)) { if (L.done) throw new Error('match ended early'); await sleep(200); } };
  const playerOf = (L, name) => L.host.evaluate(n => H.state.players.find(p => p.name === n), name);
  // Run a check only if the match is long enough for it
  const upTo = (round, what) => { if (round <= ROUNDS) return true; skipped.push(`${what} (needs ${round} rounds)`); return false; };

  /* ---------- Things that go wrong in class 1 ---------- */
  async function scenarioOne(A) {
    const N = A.name;
    if (upTo(1, 'ranks appear once someone scores')) {
      await waitRound(A, 1, 'playing');
      await A.host.waitForFunction(() => H.state.players.some(p => p.points > 0), null, { timeout: 35000 });
      await sleep(300);
      const ranks = await A.host.$$eval('#hScores .sb-rank', e => e.map(x => x.textContent));
      ok(ranks[0] !== '' && ranks.every(r => r !== ''), `${N}: ranks appear once someone has scored`);
    }
    if (upTo(2, 'five phones drop mid-round')) {
      await waitRound(A, 2, 'playing'); await sleep(2500);
      const drops = A.sims.slice(5, 10), before = {};
      for (const sp of drops) before[sp.name] = await playerOf(A, sp.name);
      drops.forEach(sp => sp.s.io.engine.close());
      await sleep(3000);
      let good = true;
      for (const sp of drops) {
        const now = await playerOf(A, sp.name);
        if (!now) { fail(`${N} round 2: ${sp.name} missing after a quick drop`); good = false; continue; }
        if (now.points < before[sp.name].points) { fail(`${N} round 2: ${sp.name} lost points on rejoining`); good = false; }   // (may have scored meanwhile)
        const inGroup = await A.host.evaluate(id => H.state.groups.some(g => g.members.includes(id)), now.id);
        if (before[sp.name].group !== null && !inGroup) { fail(`${N} round 2: ${sp.name} lost their place in the race`); good = false; }
        if (!before[sp.name].solved && !before[sp.name].gaveUp && now.group !== null) sp.submit();   // carry on and finish
      }
      ok(good && drops.every(sp => sp.rejoinedCount >= 1), `${N} round 2: five phones dropped mid-round at once and all got their own seats back`);
    }
    if (upTo(3, 'reload the page mid-round')) {
      await waitRound(A, 3, 'playing'); await sleep(1500);
      const bp = A.bp[1]; bp.paused = true;
      const pb = await playerOf(A, `${N}-Browser2`);
      await bp.reload();
      await bp.waitForFunction(() => R.me && !document.getElementById('board').hidden, null, { timeout: 10000 }).catch(() => {});
      const pa = await playerOf(A, `${N}-Browser2`);
      const vis = await bp.evaluate(() => ({ board: !document.getElementById('board').hidden, me: R.me }));
      ok(pa && pa.points === pb.points && pa.group !== null && vis.board && vis.me === `${N}-Browser2`, `${N} round 3: a phone reloaded the page mid-round and went straight back to its cards and score`);
      bp.paused = false;
    }
    if (upTo(4, 'pause after this round, Help over the results, resume')) {
      await waitRound(A, 3, 'playing');
      await A.host.click('#hPause'); await sleep(300);
      ok(await A.host.textContent('#hPause') === 'Resume' && /Pausing after this round/.test(await A.host.textContent('#hStatus')), `${N} round 3: Pause After This Round works mid-round`);
      ok(/Paused after this round/.test(await A.bp[0].textContent('#status')), `${N} round 3: players see "Paused after this round"`);
      await waitRound(A, 3, 'result'); await sleep(7000);
      const ph = await A.host.evaluate(() => [H.state.phase, H.state.matchRound].join());
      ok(ph === 'result,3', `${N} round 3: still on the results 7 seconds later while paused`);
      ok(/Paused by the host/.test(await A.bp[0].textContent('#againNote')), `${N} round 3: players are told the host has paused`);
      ok(/Paused/.test(await A.host.textContent('#hBanner')), `${N} round 3: the projector says Paused`);
      // A student opens Help over the results, then closes it with Escape
      await A.bp[0].keyboard.press('F1'); await sleep(200);
      await shot(A.host, `${N}-host-paused`); await shot(A.bp[1], `${N}-phone-paused`);
      await A.bp[0].keyboard.press('Escape'); await sleep(150);
      ok(!(await A.bp[0].evaluate(() => document.getElementById('helpDlg').classList.contains('show'))), `${N} round 3: Escape closes Help when it's open over the results`);
      await A.host.click('#hPause'); const resumedAt = Date.now();
      await waitRound(A, 4, 'countdown');
      const gap = (Date.now() - resumedAt) / 1000;
      ok(gap > 2 && gap < 5, `${N} round 3→4: Resume restarts the 3-second countdown (${gap.toFixed(1)} s)`);
    }
    if (upTo(6, 'a phone leaves and comes back between rounds')) {
      await waitRound(A, 5, 'playing'); await sleep(2000);
      const sp = A.sims[12], before = await playerOf(A, sp.name);
      sp.s.io.reconnection(false); sp.s.disconnect(); await sleep(1500);
      ok(!(await playerOf(A, sp.name)), `${N} round 5: the server notices a phone leave`);
      await waitRound(A, 5, 'result'); await sleep(500);
      sp.s.io.reconnection(true); sp.s.connect(); await sleep(1500);
      const after = await playerOf(A, sp.name);
      ok(after && after.points === before.points, `${N} round 5: that phone came back between rounds with its points`);
    }
    if (upTo(6, 'outsiders refused mid-match')) {
      await waitRound(A, 6, 'playing');
      for (const [nm, why] of [['Outsider', 'a new name'], [`${N}-Kid04`, "someone else's name"]]) {
        const x = io(URL, { transports: ['websocket'], forceNew: true });
        const r = await new Promise(res => x.on('connect', () => x.emit('join', { code: A.code, name: nm, token: 'outsider-' + nm }, res)));
        x.disconnect();
        ok(!r.ok, `${N} round 6: joining mid-match with ${why} is refused`);
      }
      const n = await A.host.evaluate(() => H.state.players.length);
      ok(n === PLAYERS, `${N} round 6: still ${PLAYERS} players after outsiders tried to join`);
    }
    if (upTo(7, 'Bonk needs two presses')) {
      await waitRound(A, 7, 'playing'); await sleep(4000);
      const target = `${N}-Kid02`;
      const btn = () => A.host.locator(`#hScores .sb-row:has-text("${target}") .bonk-btn`);
      const b0 = (await playerOf(A, target)).points;
      await btn().dispatchEvent('pointerdown'); await sleep(1200);
      const label = await btn().textContent(), b1 = (await playerOf(A, target)).points;
      ok(label === 'Sure?' && b1 >= b0, `${N} round 7: one Bonk press only asks "Sure?" (while the scoreboard keeps updating)`);
      await btn().dispatchEvent('pointerdown'); await sleep(500);
      const b2 = (await playerOf(A, target)).points, taken = Math.min(500, b1);
      A.bonkTaken.set(target, (A.bonkTaken.get(target) || 0) + taken);
      ok(b2 === b1 - taken, `${N} round 7: the second press bonks (${b1} → ${b2})`);
      await btn().dispatchEvent('pointerdown'); await sleep(3400);
      ok(await btn().textContent() === 'Bonk', `${N} round 7: an unconfirmed "Sure?" goes back to Bonk after 3 seconds`);
    }
    if (upTo(8, 'answers timed on the device')) {
      // Two phones are driven by hand next round: one on a slow connection, one claiming an impossible time
      const slow = A.sims[14], liar = A.sims[15];
      await waitRound(A, 7, 'result'); slow.manual = liar.manual = true;
      await waitRound(A, 8, 'playing'); await sleep(5000);
      const t = slow.elapsed();
      await sleep(1500);   // the answer takes 1.5 seconds to reach the server
      const rs = await new Promise(res => slow.s.emit('submit', slow.moves, t, res));
      ok(rs.ok && Math.abs(rs.time - t) < 0.05, `${N} round 8: an answer delayed 1.5 s on a slow connection is timed on the device (${t.toFixed(1)} s, recorded ${rs.time && rs.time.toFixed(1)} s)`);
      await sleep(3000);
      const real = liar.elapsed();
      const rl = await new Promise(res => liar.s.emit('submit', liar.moves, 0.3, res));
      ok(rl.ok && rl.time > real - 0.5, `${N} round 8: a device claiming 0.3 s after ${real.toFixed(1)} s is ignored and timed by the server (${rl.time && rl.time.toFixed(1)} s)`);
      slow.manual = liar.manual = false;
    }
  }

  /* ---------- Things that go wrong in class 2 ---------- */
  async function scenarioTwo(B) {
    const N = B.name;
    if (upTo(2, 'laptop connection drops')) {
      await waitRound(B, 2, 'playing'); await sleep(1000);
      const bp = B.bp[0]; bp.paused = true;
      const before = await playerOf(B, `${N}-Browser1`);
      await bp.evaluate(() => socket.io.engine.close());
      await sleep(80);
      const banner = await bp.evaluate(() => !document.getElementById('netBanner').hidden);
      await bp.waitForFunction(() => !R.offline && document.getElementById('netBanner').hidden, null, { timeout: 10000 }).catch(() => {});
      const after = await playerOf(B, `${N}-Browser1`);
      ok(banner && after && after.points === before.points && after.group === before.group, `${N} round 2: a laptop's connection drops: it shows "Reconnecting…", then rejoins its seat and race`);
      bp.paused = false;
    }
    if (upTo(3, 'a second device using a playing name is refused')) {
      await waitRound(B, 3, 'playing'); await sleep(1000);
      const other = await page(1000, 700); await other.goto(URL + '/');
      await other.fill('#codeInput', B.code); await other.fill('#nameInput', `${N}-Browser2`); await other.click('button[type=submit]');
      await sleep(800);
      const msg = await other.textContent('#joinMsg'), n = await B.host.evaluate(() => H.state.players.length);
      const still = await B.bp[1].evaluate(() => !!R.me && !R.offline);
      ok(/lobby is (closed|full)/.test(msg) && n === PLAYERS && still, `${N} round 3: another device can't take a playing student's seat by typing their name; the student keeps playing`);
      await other.close();
    }
    if (upTo(4, 'ten phones drop at the end of a round')) {
      await waitRound(B, 4, 'playing');
      await B.host.waitForFunction(() => (H.state.phase === 'playing' && H.state.timeLeftMs < 3000) || H.state.phase === 'result', null, { timeout: 40000 }).catch(() => {});
      const ten = B.sims.slice(2, 12), pts = {};
      const net = n => -(((B.adj && B.adj.get(n)) || 0));   // undo any steals made meanwhile
      for (const sp of ten) pts[sp.name] = (await playerOf(B, sp.name))?.points + net(sp.name);
      ten.forEach(sp => sp.s.io.engine.close());
      await sleep(4000);
      const back = await Promise.all(ten.map(sp => playerOf(B, sp.name)));
      ok(back.every((p, i) => p && p.points + net(ten[i].name) >= pts[ten[i].name]), `${N} round 4: ten phones dropped together as the round ended; all came back with their points`);
    }
    if (upTo(6, 'pause on the results, then Start Next Round')) {
      await waitRound(B, 5, 'result'); await B.host.click('#hPause'); await sleep(5000);
      ok((await B.host.evaluate(() => H.state.phase)) === 'result' && await B.host.textContent('#hNext') === 'Start Next Round', `${N} round 5: Pause on the results stops the countdown`);
      await B.host.click('#hNext'); await sleep(400);
      ok((await B.host.evaluate(() => [H.state.phase, H.state.hold])).join() === 'countdown,false', `${N} round 5→6: Start Next Round starts straight away and clears the pause`);
    }
    if (upTo(7, 'card taps: limited, only to opponents, no scoreboard redraw')) {
      await waitRound(B, 7, 'playing');
      await B.host.evaluate(() => { window.__mut = 0; window.__prog = 0; window.__races = 0;
        window.__mo = new MutationObserver(m => { window.__mut += m.length; }); window.__mo.observe(document.getElementById('hScores'), { childList: true, subtree: true, characterData: true });
        window.__mo2 = new MutationObserver(m => { window.__races += m.length; }); window.__mo2.observe(document.getElementById('hRaces'), { childList: true, subtree: true });
        socket.on('progress', () => window.__prog++); });
      await sleep(150);
      // A simulated phone whose opponent is also simulated (so we can count what arrives)
      const st = B.sims[0].state;
      const f = B.sims.slice(13).find(x => { const g = st.groups.find(g => g.members.includes(x.id)); return g && B.sims.some(y => y !== x && g.members.includes(y.id)); });
      const g = f && st.groups.find(g => g.members.includes(f.id));
      const opps = B.sims.filter(x => g && g.members.includes(x.id) && x !== f);
      const before = opps.map(o => (o.from && o.from[f.id]) || 0), states0 = B.sims[0].cardOnlyStates || 0;
      const nums = st.nums.length;
      for (let k = 0; k < 50; k++) f.s.emit('progress', { layout: new Array(nums).fill(true), sel: k % nums });   // a burst of 50 at once
      await sleep(300);
      const got = opps.map((o, i) => ((o.from && o.from[f.id]) || 0) - before[i]);
      const flood = await B.host.evaluate(() => ({ mut: window.__mut, races: window.__races }));
      // The flood only moved the selected card, which the host doesn't show. Now a real move (a card used up):
      await sleep(1000);   // let the limit refill
      f.s.emit('progress', { layout: [false, ...new Array(nums - 1).fill(true)], sel: null, move: { a: 0, b: 1 } });
      await sleep(300);
      const h = await B.host.evaluate(() => { window.__mo.disconnect(); window.__mo2.disconnect(); return { mut: window.__mut, prog: window.__prog, races: window.__races }; });
      ok(flood.races === 0, `${N} round 7: taps that only change the selected card don't redraw the host's races (${flood.races} changes)`);
      ok(opps.length && got.every(n => n >= 8 && n <= 14), `${N} round 7: a burst of 50 card taps from one phone: its opponent got ${got.join(' and ')} (the limit lets 10 through, then 10 a second)`);
      ok((B.sims[0].cardOnlyStates || 0) === states0, `${N} round 7: card taps don't send the whole game to the class (${(B.sims[0].cardOnlyStates || 0) - states0} full updates caused by the flood)`);
      ok(h.prog > 0 && h.races > flood.races && flood.mut === 0, `${N} round 7: a real move redraws the host's races, and the scoreboard is left alone (${flood.mut} scoreboard changes during the flood)`);
      const stray = [...LOBBIES.flatMap(L => L.sims)].reduce((n, x) => n + (x.strayProgress || 0), 0);
      ok(stray === 0, `${N} round 7: nobody received card taps from players outside their own race (${stray})`);
    }
    if (upTo(9, 'pause and resume within one round')) {
      await waitRound(B, 8, 'playing'); await B.host.click('#hPause'); await sleep(1500); await B.host.click('#hPause');
      await waitRound(B, 9, 'countdown');
      ok(true, `${N} round 8: pausing and resuming within a round leaves the next round starting by itself`);
    }
  }

  /* ---------- Extra classes ---------- */
  async function trioClass(C) {
    await C.host.waitForFunction(() => H.state && H.state.phase === 'final', null, { timeout: (ROUNDS * 60 + 120) * 1000 });
    C.done = true;
    const counts = [...C.simsList.map(x => C.trios.get(x.name) || 0)];
    const spread = Math.max(...counts) - Math.min(...counts);
    ok(spread <= 1, `C (7 players): the group of three is shared around: times in it ${counts.join(', ')}`);
  }
  async function practiceClass(D) {
    const bp = D.bpx;
    try {
      await bp.waitForFunction(() => { const s = R.state, me = s && s.players.find(p => p.id === R.myId); return (me && me.out) || (s && s.phase === 'final'); }, null, { timeout: 8 * 60000 });
      if (await bp.evaluate(() => R.state.phase === 'final')) { skipped.push('practice when out (the browser player was never knocked out)'); return; }
      const outRound = await bp.evaluate(() => R.state.matchRound);
      await bp.waitForFunction(r => (R.state.phase === 'playing' && R.state.matchRound > r && R.practice && !R.locked) || R.state.phase === 'final', outRound, { timeout: 90000 });
      if (await bp.evaluate(() => R.state.phase === 'final')) { skipped.push('practice when out (the match ended straight after)'); return; }
      const v = await bp.evaluate(() => ({ board: !document.getElementById('board').hidden, msg: document.getElementById('msg').textContent }));
      ok(v.board && /practise/.test(v.msg), `D (Elimination): a knocked-out player gets the same cards to practise on ("${v.msg.slice(0, 40)}…")`);
      const pts0 = await D.host.evaluate(() => H.state.players.find(p => p.name === 'D-Browser').points);
      const mv = findMoves(await bp.evaluate(() => R.nums)); let sel = null;
      for (const m of mv) { if (sel !== m.a) await bp.keyboard.press(String(m.a + 1)); await bp.keyboard.press(opKey[m.op]); await bp.keyboard.press(String(m.b + 1)); sel = m.b; await sleep(70); }
      await sleep(600);
      const after = await bp.evaluate(() => document.getElementById('msg').textContent);
      const me = await D.host.evaluate(() => H.state.players.find(p => p.name === 'D-Browser'));
      ok(/Practice/.test(after) && !me.solved && me.points === pts0 && me.out, `D (Elimination): making 24 in practice says so and doesn't count (still out, points unchanged)`);
      await D.host.waitForFunction(() => H.state.phase !== 'playing', null, { timeout: 40000 });
      await sleep(800);
      const sub = await bp.evaluate(() => document.getElementById('resSub').textContent);
      ok(/practis/.test(sub) || /last one standing/.test(sub) || await bp.evaluate(() => R.state.phase === 'final'), `D (Elimination): the results tell an out player they can keep practising`);
    } catch (e) { fail(`D: practice checks stopped: ${e.message.split('\n')[0]}`); }
  }

  // A browser player wins three races in a row, then steals using the real buttons
  async function streakClass(L) {
    const bp = L.bpx, elim = L.mode === 'elim', N = `${L.name} (${elim ? 'Elimination' : 'Points'})`;
    bp.paused = false;
    try {
      for (let round = 1; round <= 3; round++) {
        await bp.waitForFunction(r => R.state && R.state.phase === 'playing' && R.state.matchRound === r && canPlay(), round, { timeout: 60000 });
        await sleep(600);
        const mv = findMoves(await bp.evaluate(() => R.nums)); let sel = null;
        for (const m of mv) { if (sel !== m.a) await bp.keyboard.press(String(m.a + 1)); await bp.keyboard.press(opKey[m.op]); await bp.keyboard.press(String(m.b + 1)); sel = m.b; await sleep(60); }
        if (round === 1) {
          await sleep(400);
          const line = await bp.evaluate(() => document.getElementById('termBody').innerText);
          ok(/E-Browser beats E-Kid0\d and E-Kid0\d|F-Browser beats F-Kid0\d and F-Kid0\d/.test(line), `${N}: the terminal window shows "${line.split('\n').find(l => /beats/.test(l)) || line.trim()}"`);
        }
      }
      await bp.waitForFunction(() => R.state.phase === 'result' && !document.getElementById('stealBox').hidden && document.getElementById('resultDlg').classList.contains('show'), null, { timeout: 40000 });
      const box = await bp.evaluate(() => ({ text: document.getElementById('stealBox').innerText.replace(/\s+/g, ' '), n: document.querySelectorAll('#stealBox button').length }));
      // Points: only Kid02 has points to steal. Elimination: both kids still have 2 lives.
      ok(/3 wins in a row/.test(box.text) && box.n === (elim ? 2 : 1) && /Kid02/.test(box.text), `${N}: after three wins in a row the winner is offered a steal, listing only who can be stolen from ("${box.text.slice(0, 70)}…")`);
      const banner = await L.host.textContent('#hBanner'), next = await L.host.textContent('#hNext');
      ok(/choosing who to steal from/.test(banner) && /Waiting for a steal/.test(next), `${N}: the projector shows the winner is choosing, and the next round waits`);
      await shot(bp, `${L.name}-steal-choice`);
      const before = await L.host.evaluate(() => Object.fromEntries(H.state.players.map(p => [p.name, [p.points, p.lives]])));
      const victim = L.simsList[1]; let got = null; victim.s.once('stolen', d => { got = d; });
      const t0 = Date.now();
      await bp.click('#stealBox button:has-text("Kid02")');
      await sleep(600);
      const after = await L.host.evaluate(() => Object.fromEntries(H.state.players.map(p => [p.name, [p.points, p.lives]])));
      const me = `${L.name}-Browser`, v = victim.name;
      if (elim) ok(after[v][1] === before[v][1] - 1 && after[me][1] === Math.min(5, before[me][1] + 1), `${N}: stealing takes a life (${v} ${before[v][1]} → ${after[v][1]} lives)`);
      else { const amt = Math.min(300, before[v][0]); ok(after[v][0] === before[v][0] - amt && after[me][0] === before[me][0] + amt, `${N}: stealing moves ${amt} points (${v} ${before[v][0]} → ${after[v][0]}, ${me} ${before[me][0]} → ${after[me][0]})`); }
      const note = await bp.textContent('#stealNote'), term = await bp.evaluate(() => document.getElementById('termBody').innerText);
      ok(got && got.from === victim.id && /^You stole/.test(note) && /stole/.test(term), `${N}: everyone is told ("${got && got.text}"), and it appears in the terminal`);
      await L.host.waitForFunction(() => H.state.phase === 'countdown' || H.state.phase === 'final', null, { timeout: 15000 });
      const gap = (Date.now() - t0) / 1000;
      ok(gap < 5, `${N}: once the steal is chosen, the next round starts after the usual short countdown (${gap.toFixed(1)} s)`);
    } catch (e) { fail(`${L.name}: steal checks stopped: ${e.message.split('\n')[0]}`); }
  }

  const scripts = [];
  scripts.push(streakClass(EXTRAS[2]), streakClass(EXTRAS[3]));
  scripts.push(trioClass(EXTRAS[0]).catch(e => fail(`C: checks stopped: ${e.message.split('\n')[0]}`)));
  scripts.push(practiceClass(EXTRAS[1]));
  if (LOBBIES[0]) scripts.push(scenarioOne(LOBBIES[0]).catch(e => fail(`${LOBBIES[0].name}: checks stopped: ${e.message.split('\n')[0]}`)));
  if (LOBBIES[1]) scripts.push(scenarioTwo(LOBBIES[1]).catch(e => fail(`${LOBBIES[1].name}: checks stopped: ${e.message.split('\n')[0]}`)));

  /* ---------- Wait for every match to finish ---------- */
  await Promise.all(LOBBIES.map(async L => {
    await L.host.waitForFunction(() => H.state && H.state.phase === 'final', null, { timeout: (ROUNDS * 60 + 120) * 1000 });
    L.done = true; log(`class ${L.name}: match over`);
  }));
  await EXTRAS[1].host.waitForFunction(() => H.state && H.state.phase === 'final', null, { timeout: 15 * 60000 }).catch(() => fail('D: the Elimination match never finished'));
  for (const L of EXTRAS.slice(2)) await L.host.waitForFunction(() => H.state && H.state.phase === 'final', null, { timeout: 10 * 60000 }).catch(() => fail(`${L.name}: the match never finished`));
  EXTRAS.forEach(L => { L.done = true; });
  await Promise.all(scripts);
  if (loadTimer) clearInterval(loadTimer);
  await sleep(1500);

  /* ---------- Final checks ---------- */
  for (const L of LOBBIES) {
    for (const sp of L.sims) if ([...sp.codesSeen].some(c => c !== L.code)) fail(`${L.name}: ${sp.name} saw another class's game`);
    const st = await L.host.evaluate(() => ({ round: H.state.matchRound, n: H.state.players.length, ranks: [...document.querySelectorAll('#hScores .sb-rank')].map(e => e.textContent) }));
    ok(st.round === ROUNDS && st.n === PLAYERS, `${L.name}: played all ${ROUNDS} rounds and finished with all ${PLAYERS} players`);
    ok(st.ranks.length === PLAYERS && st.ranks[0] !== '', `${L.name}: the final scoreboard shows ranks`);
    for (const [k, p] of L.bp.entries()) {
      const f = await p.evaluate(() => ({ dlg: document.getElementById('resultDlg').classList.contains('show'), title: document.getElementById('resTitle').textContent, banner: !document.getElementById('netBanner').hidden }));
      ok(f.dlg && !f.banner, `${L.name}: browser player ${k + 1} sees the final results ("${f.title}")`);
    }
    await shot(L.host, `${L.name}-host-final`); await shot(L.bp[1], `${L.name}-phone-final`);
    L.gaps = []; let resAt = 0;
    for (let i = 1; i < L.timeline.length; i++) { const a = L.timeline[i - 1], b = L.timeline[i];
      if (a.phase !== 'result' && b.phase === 'result') resAt = b.t;
      if (b.phase === 'countdown' && a.phase === 'result' && resAt) L.gaps.push(((b.t - resAt) / 1000).toFixed(1)); }
  }
  for (const L of EXTRAS) for (const sp of L.simsList) if ([...sp.codesSeen].some(c => c !== L.code)) fail(`${L.name}: ${sp.name} saw another class's game`);
  if (pageErrs.length) fail(`browser errors: ${[...new Set(pageErrs)].join(' | ')}`);

  /* ---------- Report ---------- */
  console.log('\n================ CLASS TEST REPORT ================');
  for (const L of LOBBIES) console.log(`Class ${L.name} (${L.cards} cards): made 24 per round ${L.rounds.map(r => `${r.solved}/${r.players}`).join(', ')}\n  seconds from results to next round: ${L.gaps.join(', ')}`);
  { const wasted = LOBBIES.flatMap(L => L.sims).reduce((n, x) => n + (x.cardOnlyStates || 0), 0);
    ok(wasted === 0, `all classes: no full game updates were sent just because someone's cards moved (${wasted})`); }
  { const all = LOBBIES.flatMap(L => L.sims), rounds = ROUNDS;
    console.log(`Messages per simulated phone per round: ${(all.reduce((n, x) => n + x.statesIn, 0) / all.length / rounds).toFixed(1)} full game updates, ${(all.reduce((n, x) => n + x.progressIn, 0) / all.length / rounds).toFixed(1)} opponent card updates`); }
  { const st = LOBBIES.reduce((n, L) => n + (L.steals || 0), 0), lap = LOBBIES.reduce((n, L) => n + (L.stealsLapsed || 0), 0);
    console.log(`Steals by simulated phones in the big classes: ${st} made, ${lap} left to run out`); }
  if (EXTRAS[0].trios) console.log(`Class C: times each player was in the group of three: ${[...EXTRAS[0].trios.values()].join(', ')}`);
  console.log(`Class D (Elimination): ${EXTRAS[1].rounds.length} rounds`);
  if (load.length) { const c = load.map(m => m.cpu), r = load.map(m => m.rss);
    console.log(`Server: CPU average ${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(1)}%, peak ${Math.max(...c).toFixed(1)}% of one core; memory ${Math.min(...r).toFixed(0)}–${Math.max(...r).toFixed(0)} MB`); }
  console.log(`Passed: ${passes.length}   Failed: ${issues.length}${skipped.length ? `   Skipped: ${skipped.length}` : ''}   Time: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  if (skipped.length) console.log('Skipped (match too short): ' + skipped.join('; '));
  if (issues.length) console.log('\nFAILED:\n- ' + issues.join('\n- '));
  else console.log('\nEverything passed.');
  await browser.close();
  if (server) server.child.kill();
  process.exit(issues.length ? 1 : 0);
})().catch(e => { console.error('The test crashed:', e); process.exit(1); });

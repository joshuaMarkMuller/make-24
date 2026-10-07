/*
 * Make 24 race server (Stage 5): online lobbies with join codes.
 *
 * One server runs many lobbies at once. Opening the host screen (/host.html)
 * creates a lobby with a short code (like KQ7PX). Players open the site's home
 * page, type the code and their name, and join that lobby. Inside a lobby the
 * game plays exactly as in Stage 4 (see room.js).
 *
 * Run with:  npm install   (first time only)
 *            npm start
 * Works the same on your own computer (players on the same Wi-Fi) or on a
 * hosting service (it listens on the PORT the service gives it).
 */
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { createRoom, splitIntoGroups } = require('./room.js');

const PORT = process.env.PORT || 3000;
const MAX_LOBBIES = 200;                    // protects the server from runaway lobby creation
const IDLE_MS = 10 * 60 * 1000;             // empty lobbies are cleared after 10 minutes
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I/L: easy to read off a projector
const CODE_LEN = 5;

// Addresses players on the same Wi-Fi can use (shown on the host screen when run locally)
const LAN_IPS = Object.values(os.networkInterfaces()).flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const JOIN_URLS = LAN_IPS.map(a => `http://${a}:${PORT}/`);

const app = express();
const PUBLIC = path.join(__dirname, '..', 'public');
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'race.html')));   // home page = join a lobby
app.get('/healthz', (req, res) => res.send('ok'));                          // for hosting health checks
app.use(express.static(PUBLIC, { index: false }));
const server = http.createServer(app);
const io = new Server(server);

/* ---------- Lobbies ---------- */
const rooms = new Map();   // code → room

function newCode() {
  for (;;) {
    const code = [...crypto.randomBytes(CODE_LEN)].map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
    if (!rooms.has(code)) return code;
  }
}
const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);

// Clear away lobbies nobody is using
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isAbandoned(IDLE_MS)) { room.close(); rooms.delete(code); }
  }
}, 60 * 1000).unref();

io.on('connection', socket => {
  const inLobby = () => !!socket.data.code;

  // Host screen: start a new lobby
  socket.on('createLobby', reply => {
    if (typeof reply !== 'function') return;
    if (inLobby()) return reply({ ok: false, error: 'This screen is already in a lobby. Reload to start another.' });
    if (rooms.size >= MAX_LOBBIES) return reply({ ok: false, error: 'The server is full right now. Please try again in a few minutes.' });
    const code = newCode();
    const room = createRoom(io, code, { joinUrls: JOIN_URLS });
    rooms.set(code, room);
    room.claimHost(socket);
    reply({ ok: true, code, key: room.hostKey });
  });

  // Host screen reloaded (or reconnected): take back its own lobby
  socket.on('reclaimHost', ({ code, key } = {}, reply) => {
    if (typeof reply !== 'function') return;
    if (inLobby()) return reply({ ok: false, error: 'This screen is already in a lobby.' });
    const room = rooms.get(cleanCode(code));
    if (!room || typeof key !== 'string' || key !== room.hostKey) return reply({ ok: false, error: 'That lobby has closed.' });
    if (room.hostIsConnected()) return reply({ ok: false, error: 'That lobby is already open on another host screen.' });
    room.claimHost(socket);
    reply({ ok: true, code: room.code, key: room.hostKey });
  });

  // Player: join a lobby by its code
  socket.on('join', ({ code, name, emoji } = {}, reply) => {
    if (typeof reply !== 'function') return;
    if (inLobby()) return reply({ ok: false, error: 'You are already in a lobby.' });
    const c = cleanCode(code);
    if (c.length !== CODE_LEN) return reply({ ok: false, error: `Lobby codes have ${CODE_LEN} letters and numbers.` });
    const room = rooms.get(c);
    if (!room) return reply({ ok: false, error: `No lobby with the code ${c}. Check the code on the host's screen.` });
    reply(room.addPlayer(socket, name, emoji));
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('Make 24 is running.');
    console.log(`  Host screen (open on your computer):  http://localhost:${PORT}/host.html`);
    for (const u of JOIN_URLS) console.log(`  Players join at (same Wi-Fi):         ${u}`);
    console.log('Press Ctrl+C to stop.');
  });
}

module.exports = { splitIntoGroups, app, server, io, rooms };

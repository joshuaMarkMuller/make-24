/* emoji.js — the emoji players can pick, and the win/lose animation helper.
 * Shared by the player screen, the host screen and the server (which only accepts emoji from this list). */
const EMOJIS = [
  // Faces
  ['😀', 'Grinning', 'Faces'], ['😂', 'Laughing', 'Faces'], ['😎', 'Cool', 'Faces'], ['🤓', 'Nerd', 'Faces'],
  ['🥳', 'Party', 'Faces'], ['🤩', 'Star-struck', 'Faces'], ['😇', 'Angel', 'Faces'], ['🤔', 'Thinking', 'Faces'],
  ['😜', 'Cheeky', 'Faces'], ['🤠', 'Cowboy', 'Faces'], ['🤯', 'Mind blown', 'Faces'], ['😴', 'Sleepy', 'Faces'],
  ['😭', 'Crying', 'Faces'], ['😱', 'Scared', 'Faces'], ['🙄', 'Eye roll', 'Faces'], ['😤', 'Huffing', 'Faces'],
  ['😠', 'Angry', 'Faces'], ['🤢', 'Sick', 'Faces'], ['🤮', 'Vomiting', 'Faces'],
  // Animals
  ['🐶', 'Dog', 'Animals'], ['🐱', 'Cat', 'Animals'], ['🐼', 'Panda', 'Animals'], ['🦊', 'Fox', 'Animals'],
  ['🐸', 'Frog', 'Animals'], ['🐵', 'Monkey', 'Animals'], ['🦁', 'Lion', 'Animals'], ['🐯', 'Tiger', 'Animals'],
  ['🐨', 'Koala', 'Animals'], ['🐰', 'Rabbit', 'Animals'], ['🐻', 'Bear', 'Animals'], ['🐧', 'Penguin', 'Animals'],
  ['🦄', 'Unicorn', 'Animals'], ['🐙', 'Octopus', 'Animals'], ['🦖', 'Dinosaur', 'Animals'], ['🐢', 'Turtle', 'Animals'],
  ['🐝', 'Bee', 'Animals'], ['🦋', 'Butterfly', 'Animals'], ['🐬', 'Dolphin', 'Animals'], ['🦉', 'Owl', 'Animals'],
  ['🦘', 'Kangaroo', 'Animals'],
];
const EMOJI_SET = new Set(EMOJIS.map(e => e[0]));
const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)][0];
const cleanEmoji = e => (EMOJI_SET.has(e) ? e : randomEmoji());

if (typeof module !== 'undefined') module.exports = { EMOJIS, cleanEmoji };

/* ---------- Browser only: emoji next to names, animated for wins and losses ---------- */
if (typeof window !== 'undefined') {
  // Standings for either game mode. Points: most points, then races won.
  // Elimination: players still in first (most lives), then those knocked out latest.
  window.isElim = s => !!s && s.mode === 'elim';
  window.rankPlayers = s => [...s.players].sort(isElim(s)
    ? (a, b) => (a.out - b.out) || (b.lives - a.lives) || (b.outRound - a.outRound) || (b.wins - a.wins)
    : (a, b) => (b.points - a.points) || (b.wins - a.wins));
  window.samePlace = (s, a, b) => !!a && !!b && (isElim(s)
    ? a.out === b.out && a.lives === b.lives && a.outRound === b.outRound
    : a.points === b.points && a.wins === b.wins);
  // Hearts for elimination mode: ❤️ for each life left, 🤍 for each life lost
  window.hearts = (s, p) => '❤️'.repeat(p.lives) + '🤍'.repeat(Math.max(0, (s.maxLives || 3) - p.lives));
  // Did this player win or lose? Round results: winning your race = win, anyone else in a race = lose.
  // Live: making 24 first = win, giving up = lose. Final results: the match winner(s) win, everyone else loses.
  window.emojiMood = (s, id) => {
    if (!s) return '';
    if (s.phase === 'final') {
      const rows = rankPlayers(s);
      const top = rows[0];
      if (!top || (!isElim(s) && top.points === 0)) return '';
      const me = rows.find(p => p.id === id);
      if (!me) return '';
      return samePlace(s, me, top) ? 'win' : 'lose';
    }
    if (s.phase === 'result' && s.result) {
      const g = s.result.groups.find(g => g.members.includes(id));
      return !g ? '' : g.winnerId === id ? 'win' : 'lose';
    }
    if (s.phase === 'playing') {
      const g = s.groups.find(g => g.members.includes(id));
      const p = s.players.find(p => p.id === id);
      if (g && g.winnerId === id) return 'win';
      if (p && p.gaveUp) return 'lose';
      if (p && p.out) return 'lose';
    }
    return '';
  };
  // Screens redraw often; a negative animation-delay keeps each animation running smoothly
  // from when it first started instead of restarting on every redraw.
  const started = new Map();
  const idleOffset = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 2400; };
  window.emojiTag = (s, p, extraClass = '') => {
    if (!p) return '';
    const mood = emojiMood(s, p.id);
    const key = `${s && s.round}|${p.id}|${mood}`;
    if (mood && !started.has(key)) started.set(key, performance.now());
    if (started.size > 500) started.clear();
    // No win or lose: a gentle idle sway, each player slightly out of step with the others
    const ms = mood ? performance.now() - started.get(key) : performance.now() + idleOffset(p.id);
    return `<span class="emo ${mood || 'idle'}${extraClass ? ' ' + extraClass : ''}" style="animation-delay:-${Math.round(ms)}ms" aria-hidden="true">${p.emoji || ''}</span>`;
  };
}

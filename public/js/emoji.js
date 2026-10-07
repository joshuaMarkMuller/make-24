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
  // Did this player win or lose? Round results: winning your race = win, anyone else in a race = lose.
  // Live: making 24 first = win, giving up = lose. Final results: the match winner(s) win, everyone else loses.
  window.emojiMood = (s, id) => {
    if (!s) return '';
    if (s.phase === 'final') {
      const rows = [...s.players].sort((a, b) => b.points - a.points || b.wins - a.wins);
      const top = rows[0];
      if (!top || top.points === 0) return '';
      const me = rows.find(p => p.id === id);
      if (!me) return '';
      return me.points === top.points && me.wins === top.wins ? 'win' : 'lose';
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
    }
    return '';
  };
  // Screens redraw often; a negative animation-delay keeps each animation running smoothly
  // from when it first started instead of restarting on every redraw.
  const started = new Map();
  window.emojiTag = (s, p, extraClass = '') => {
    if (!p) return '';
    const mood = emojiMood(s, p.id);
    const key = `${s && s.round}|${p.id}|${mood}`;
    if (mood && !started.has(key)) started.set(key, performance.now());
    if (started.size > 500) started.clear();
    const delay = mood ? ` style="animation-delay:-${Math.round(performance.now() - started.get(key))}ms"` : '';
    return `<span class="emo${mood ? ' ' + mood : ''}${extraClass ? ' ' + extraClass : ''}"${delay} aria-hidden="true">${p.emoji || ''}</span>`;
  };
}

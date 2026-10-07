/* term.js — the little early-2000s terminal window that lists who beat whom (and any steals)
 * as the races finish. Used by the player screen and the host screen. */
(function () {
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // body: the terminal's text area. s: game state (s.feed holds the latest lines). lines: how many to show.
  // Only redraws when a new line arrives; the newest line types itself out.
  window.renderTerm = (body, s, lines) => {
    if (!body) return;
    const feed = ((s && s.feed) || []).slice(-lines);
    const sig = feed.map(f => f.n).join() || 'empty';
    if (body.dataset.sig === sig) return;
    const last = +(body.dataset.last || 0);
    body.dataset.sig = sig;
    body.innerHTML = (feed.length
      ? feed.map(f => {
          const text = '> ' + f.text;
          const typing = last && f.n > last && !matchMedia('(prefers-reduced-motion: reduce)').matches;
          return `<div class="term-line ${f.kind}${typing ? ' typing' : ''}" style="--chars:${text.length}">${esc(text)}</div>`;
        }).join('')
      : '<div class="term-line idle">&gt; Waiting for the first race to finish…</div>') +
      '<span class="term-cursor" aria-hidden="true">_</span>';
    body.dataset.last = feed.length ? feed[feed.length - 1].n : last;
  };
  window.termHTML = (id, title) =>
    `<div class="term" aria-label="Race results"><div class="term-bar"><span class="term-title">${title}</span>` +
    `<span class="term-btns" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span></div>` +
    `<div class="term-body" id="${id}" role="log" aria-live="polite"></div></div>`;
})();

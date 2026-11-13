import { LETTER_POINTS } from './dictionary.js';

export function tileHTML(letter, cls = '') {
  return `<span class="tile ${cls}"><span class="tile-letter">${letter}</span><span class="tile-pts">${LETTER_POINTS[letter] ?? ''}</span></span>`;
}

export const wordTilesHTML = (word, cls = '') =>
  `<span class="word-tiles" aria-label="${word}">${[...word].map((l) => tileHTML(l, cls)).join('')}</span>`;

export function setMessage(el, text, tone = 'info') {
  el.textContent = text;
  el.dataset.tone = tone;
}

export function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart the animation
  el.classList.add('shake');
}

/** Easy/Hard switch shown in every mode's header; main.js keeps them in sync. */
export const tierControlHTML = () => `
  <div class="segmented tier-switch" role="radiogroup" aria-label="Word difficulty" hidden>
    <button role="radio" data-tier="easy">Easy</button>
    <button role="radio" data-tier="hard">Hard</button>
  </div>`;

// ---------- Per-mode stats (streaks), kept in localStorage ----------

const STATS_KEY = 'bingoer.stats.v1';

function readStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch { return {}; }
}

export const stats = {
  data: readStats(),
  get(mode) { return this.data[mode] || { solved: 0, streak: 0, best: 0 }; },
  record(mode, won) {
    const s = { ...this.get(mode) };
    if (won) { s.solved += 1; s.streak += 1; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
    this.data[mode] = s;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
    return s;
  },
};

export function readPref(key, fallback) {
  try { return localStorage.getItem(`bingoer.${key}`) ?? fallback; } catch { return fallback; }
}
export function writePref(key, value) {
  try { localStorage.setItem(`bingoer.${key}`, value); } catch { /* storage unavailable */ }
}

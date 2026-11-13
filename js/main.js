import { Dictionary, parseWordList } from './dictionary.js';
import { makeStarterRound, makeTimedRound } from './generators.js';
import { RackMode } from './rackMode.js';
import { BoardMode } from './boardMode.js';
import { stats, readPref, writePref } from './ui.js';
import { loadBuiltIn, loadSavedList, saveList, clearSavedList, loadEasyWords } from './wordlists.js';

const $ = (sel) => document.querySelector(sel);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const ctx = {
  dict: null,
  list: null, // { id, name, size }
  easyWords: null,
  tierPref: readPref('tier', 'easy') === 'hard' ? 'hard' : 'easy',
  rng: Math.random,
  /** 'easy' or 'hard' when the active list supports it, otherwise 'all'. */
  get tier() { return this.dict?.hasTiers ? this.tierPref : 'all'; },
  onStats: (mode, won) => { stats.record(statsKey(mode), won); renderStats(); },
};

// Streaks are kept separately for Easy and Hard.
const statsKey = (mode) => (ctx.tier === 'all' ? mode : `${mode}-${ctx.tier}`);

let modes = null;
let active = null;

// ---------- loading overlay ----------
function showLoading(text) { $('#loading-text').textContent = text; $('#loading').hidden = false; }
function hideLoading() { $('#loading').hidden = true; }

// ---------- word lists ----------
const ABOUT = {
  enable: 'ENABLE is a free, public-domain list of North American English words. Some words that are valid in Collins aren\'t in it.',
  custom: 'This is the list you loaded. It\'s saved on this device.',
  dev: 'Loaded from data/words.txt in the app folder.',
  demo: 'ENABLE isn\'t installed, so this is a small demo list. Run scripts/get_enable.py to install it.',
};

/** Index a list and switch every mode over to it. Throws without changing anything if the list is unusable. */
async function activateList(source) {
  const words = parseWordList(source.text);
  showLoading(`Indexing ${words.size.toLocaleString()} words…`);
  await nextFrame();
  const dict = new Dictionary(words, { easyWords: ctx.easyWords });
  if (!dict.countOfLength(7) || !dict.countOfLength(8)) {
    throw new Error('That file has no 7- or 8-letter words. Use a plain text file with one word per line.');
  }
  ctx.dict = dict;
  ctx.list = { id: source.id, name: source.name, size: dict.size };
  if (modes) {
    for (const m of Object.values(modes)) m.newRound();
    active?.show();
  } else {
    startModes();
  }
  renderListInfo();
  renderTier();
}

function renderTier() {
  const available = ctx.dict.hasTiers;
  for (const sw of document.querySelectorAll('.tier-switch')) sw.hidden = !available;
  for (const b of document.querySelectorAll('[data-tier]')) b.setAttribute('aria-checked', String(b.dataset.tier === ctx.tierPref));
}

function setTier(tier) {
  if (tier === ctx.tierPref) return;
  ctx.tierPref = tier;
  writePref('tier', tier);
  renderTier();
  renderStats();
  for (const m of Object.values(modes)) m.newRound();
  active?.show();
}

function renderListInfo() {
  const { id, name, size } = ctx.list;
  $('#list-chip').textContent = name;
  $('#list-chip').title = `Word list: ${name}`;
  $('#list-current').textContent = `${name}: ${size.toLocaleString()} words`;
  $('#list-about').textContent = ABOUT[id];
  $('#list-reset').hidden = id !== 'custom';
  const counts = ctx.dict.tierCounts;
  $('#list-tiers').textContent = counts
    ? `Easy has ${counts.easy.toLocaleString()} bingos and Hard has ${counts.hard.toLocaleString()}.`
    : 'Easy and Hard aren\'t available for this list.';
  $('#demo-banner').hidden = id !== 'demo' || readPref('demoBannerHidden', '') === '1';
}

function setListError(text) {
  $('#list-error').textContent = text;
  $('#list-error').hidden = !text;
}

// ---------- modes ----------
function renderStats() {
  if (!active) return;
  const s = stats.get(statsKey(active.id));
  $('#stats').innerHTML = `<span><b>${s.streak}</b> streak</span><span><b>${s.best}</b> best</span>`;
}

function switchTo(id) {
  if (active?.id === id) return;
  active?.hide();
  for (const screen of document.querySelectorAll('.screen')) screen.hidden = screen.dataset.mode !== id;
  for (const b of document.querySelectorAll('.dock-tile')) {
    if (b.dataset.mode === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  active = modes[id];
  active.show();
  writePref('mode', id);
  renderStats();
}

function startModes() {
  modes = {
    a: new RackMode($('#screen-a'), ctx),
    b: new BoardMode($('#screen-b'), ctx, {
      id: 'b',
      title: 'Bingo on board',
      hint: 'Use all seven tiles: hook onto the word or build through it.',
      make: makeStarterRound,
    }),
    c: new BoardMode($('#screen-c'), ctx, {
      id: 'c',
      title: 'Timed board play',
      hint: 'Find a bingo that fits on this board before time runs out.',
      make: makeTimedRound,
      timed: true,
    }),
  };
  for (const m of Object.values(modes)) m.newRound();
}

// ---------- boot ----------
async function boot() {
  showLoading('Loading word list…');
  const [saved, easyWords] = await Promise.all([loadSavedList(), loadEasyWords()]);
  ctx.easyWords = easyWords;
  if (saved) {
    try {
      await activateList(saved);
    } catch {
      await clearSavedList().catch(() => {}); // a saved list that no longer works is dropped
    }
  }
  if (!ctx.dict) {
    try {
      await activateList(await loadBuiltIn());
    } catch {
      showLoading('Couldn\'t read the word list. Start the app with a local server from the app folder (see README), then reload.');
      return;
    }
  }
  hideLoading();
  $('.app').hidden = false;
  const first = readPref('mode', 'a');
  switchTo(modes[first] ? first : 'a');
}

// ---------- events ----------
$('.dock').addEventListener('click', (e) => {
  const b = e.target.closest('.dock-tile');
  if (b) switchTo(b.dataset.mode);
});

document.addEventListener('keydown', (e) => {
  if (!active || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('#list-dialog').open) return;
  if (e.target.closest?.('input, textarea, select')) return;
  // Space/Enter on a keyboard-focused button should press that button. After a
  // mouse or touch tap the button isn't :focus-visible, so Enter still submits.
  if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button')?.matches(':focus-visible')) return;
  active.onKey(e);
});

// Clicking or tapping a button shouldn't leave focus on it; otherwise the next
// Enter would press that button again instead of checking your word.
document.addEventListener('mousedown', (e) => {
  if (e.target.closest?.('button') && !e.target.closest('dialog')) e.preventDefault();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tier]');
  if (b) setTier(b.dataset.tier);
});

$('#demo-banner .dismiss').addEventListener('click', () => {
  writePref('demoBannerHidden', '1');
  $('#demo-banner').hidden = true;
});

$('#list-chip').addEventListener('click', () => { setListError(''); $('#list-dialog').showModal(); });
$('#demo-open-list').addEventListener('click', () => { setListError(''); $('#list-dialog').showModal(); });

$('#wordlist-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  setListError('');
  showLoading(`Reading ${file.name}…`);
  await nextFrame();
  try {
    const text = await file.text();
    await activateList({ id: 'custom', name: file.name.replace(/\.txt$/i, ''), text });
    try {
      await saveList(ctx.list.name, text);
      $('#list-dialog').close();
    } catch {
      setListError('Loaded, but it couldn\'t be saved on this device. You\'ll need to load it again next time.');
    }
  } catch (err) {
    setListError(err.message);
  }
  hideLoading();
});

$('#list-reset').addEventListener('click', async () => {
  setListError('');
  showLoading('Loading word list…');
  try {
    await clearSavedList();
    await activateList(await loadBuiltIn());
    $('#list-dialog').close();
  } catch (err) {
    setListError(err.message);
  }
  hideLoading();
});

// Handy for debugging in the browser console: bingoer.modes.b.round.solution
window.bingoer = { ctx, get modes() { return modes; } };

boot();

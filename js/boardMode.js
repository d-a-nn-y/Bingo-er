// Modes B and C: play all seven tiles on a board.
// B shows a single starter word; C shows a busier board and adds a timer.

import { SIZE, premiumAt, validatePlay, inBounds } from './board.js';
import { shuffle } from './rng.js';
import { tileHTML, setMessage, shake, readPref, writePref, tierControlHTML } from './ui.js';

const PREMIUM_LABEL = { tw: '3W', dw: '2W', tl: '3L', dl: '2L', star: '★' };
const CLOCKS = [3, 2, 1]; // minutes

// Older versions stored the clock as easy/medium/hard.
function readClock() {
  const legacy = { easy: 3, medium: 2, hard: 1 }[readPref('difficulty', '')];
  const n = Number(readPref('clock', legacy || 2));
  return CLOCKS.includes(n) ? n : 2;
}
const key = (r, c) => `${r},${c}`;

export class BoardMode {
  constructor(root, ctx, { id, title, hint, make, timed = false }) {
    this.root = root;
    this.ctx = ctx;
    this.id = id;
    this.make = make;
    this.timed = timed;
    this.visible = false;
    this.clock = readClock();
    this.build(title, hint);
  }

  build(title, hint) {
    const timerHTML = this.timed ? `
      <div class="timed-bar">
        <div class="segmented clock" role="radiogroup" aria-label="Time limit">
          ${CLOCKS.map((m) => `<button role="radio" data-clock="${m}">${m} min</button>`).join('')}
        </div>
        <div class="timer" aria-live="off"><span class="timer-text">0:00</span><span class="timer-track"><span class="timer-fill"></span></span></div>
      </div>` : '';
    this.root.classList.add('board-mode');
    this.root.innerHTML = `
      <div class="mode-head">
        <div class="mode-title-row"><h1>${title}</h1>${tierControlHTML()}</div>
        <p class="hint">${hint}</p>
      </div>
      ${timerHTML}
      <div class="board" role="grid" aria-label="Board"></div>
      <div class="rack" role="group" aria-label="Your rack"></div>
      <p class="message" role="status" aria-live="polite"></p>
      <div class="controls">
        <button class="btn ghost" data-act="shuffle">Shuffle</button>
        <button class="btn ghost" data-act="recall">Recall</button>
        <button class="btn quiet" data-act="giveup">Give up</button>
        <button class="btn primary" data-act="primary">Play word</button>
      </div>
      <div class="reveal" hidden></div>`;

    this.$board = this.root.querySelector('.board');
    this.$rack = this.root.querySelector('.rack');
    this.$msg = this.root.querySelector('.message');
    this.$controls = this.root.querySelector('.controls');
    this.$reveal = this.root.querySelector('.reveal');

    this.cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.dataset.r = r; cell.dataset.c = c;
        cell.setAttribute('role', 'gridcell');
        this.$board.appendChild(cell);
        this.cells.push(cell);
      }
    }

    this.$board.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-r]');
      if (cell) this.cellClick(Number(cell.dataset.r), Number(cell.dataset.c));
    });
    this.$rack.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.rackClick(Number(b.dataset.id));
    });
    this.$controls.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'shuffle') this.shuffle();
      else if (act === 'recall') this.recall();
      else if (act === 'giveup') this.giveUp();
      else if (act === 'primary') this.status === 'playing' ? this.submit() : this.newRound();
    });

    if (this.timed) {
      this.$seg = this.root.querySelector('.segmented.clock');
      this.$timerText = this.root.querySelector('.timer-text');
      this.$timerFill = this.root.querySelector('.timer-fill');
      this.$timer = this.root.querySelector('.timer');
      this.$seg.addEventListener('click', (e) => {
        const m = Number(e.target.closest('[data-clock]')?.dataset.clock);
        if (!m || m === this.clock) return;
        this.clock = m;
        writePref('clock', m);
        this.newRound(); // a new time limit starts a fresh board
      });
    }
  }

  // ---------- round lifecycle ----------
  newRound() {
    let round;
    try { round = this.make(this.ctx.dict, this.ctx.rng, this.ctx.tier); }
    catch (err) { setMessage(this.$msg, err.message, 'error'); return; }
    this.round = round;
    this.board = round.board;
    this.tiles = round.rack.map((letter, id) => ({ id, letter }));
    this.pending = new Map(); // "r,c" -> tile id
    this.history = [];        // placement order, for Backspace
    this.cursor = null;       // { r, c, dir }
    this.selected = null;     // tile id awaiting a square
    this.status = 'playing';
    this.lastWords = [];
    this.$reveal.hidden = true;
    setMessage(this.$msg, 'Tap a square to start, then tap tiles or type. Tap it again to turn.', 'info');
    if (this.timed) this.startTimer();
    this.render();
  }

  finish(won, extra = {}) {
    this.status = won ? 'solved' : 'revealed';
    this.stopTimer();
    this.ctx.onStats(this.id, won);
    this.cursor = null;
    this.selected = null;
    const sol = this.round.solution;
    if (won) {
      const words = extra.words;
      setMessage(this.$msg, `Bingo! ${extra.mainWord} is valid.`, 'success');
      const others = words.filter((w) => w !== extra.mainWord);
      this.$reveal.innerHTML = others.length ? `<p class="reveal-label">Also formed: ${others.join(', ')}</p>` : '';
      if (extra.mainWord !== sol.word) this.$reveal.innerHTML += `<p class="reveal-label">The bingo we hid was ${sol.word}. Yours works too.</p>`;
    } else {
      this.pending.clear();
      this.history = [];
      const lead = extra.timeout ? "Time's up." : 'The bingo was';
      setMessage(this.$msg, extra.timeout ? `Time's up. The bingo was ${sol.word}.` : `${lead} ${sol.word}.`, 'info');
      const others = sol.words.filter((w) => w !== sol.word);
      this.$reveal.innerHTML = others.length ? `<p class="reveal-label">It also forms ${others.join(', ')}.</p>` : '';
    }
    this.$reveal.hidden = !this.$reveal.innerHTML;
    this.render();
  }

  // ---------- helpers ----------
  tileById(id) { return this.tiles.find((t) => t.id === id); }
  isUsed(id) { for (const v of this.pending.values()) if (v === id) return true; return false; }
  filled(r, c) { return !!this.board[r][c] || this.pending.has(key(r, c)); }

  placements() {
    return [...this.pending].map(([k, id]) => {
      const [r, c] = k.split(',').map(Number);
      return { r, c, letter: this.tileById(id).letter };
    });
  }

  // ---------- actions ----------
  cellClick(r, c) {
    if (this.status !== 'playing') return;
    const k = key(r, c);
    if (this.pending.has(k)) {                    // tap your own tile to take it back
      this.pending.delete(k);
      this.history = this.history.filter((h) => h !== k);
      this.render();
      return;
    }
    if (this.selected !== null && !this.board[r][c]) { // tile chosen first, square second
      this.place(this.selected, r, c);
      this.selected = null;
      this.render();
      return;
    }
    if (this.cursor && this.cursor.r === r && this.cursor.c === c) {
      this.cursor.dir = this.cursor.dir === 'H' ? 'V' : 'H';
    } else {
      this.cursor = { r, c, dir: this.cursor?.dir || 'H' };
    }
    setMessage(this.$msg, '');
    this.render();
  }

  rackClick(id) {
    if (this.status !== 'playing' || this.isUsed(id)) return;
    if (this.cursor) { this.placeAtCursor(id); return; }
    this.selected = this.selected === id ? null : id;
    if (this.selected !== null) setMessage(this.$msg, 'Now tap a square.', 'info');
    this.render();
  }

  place(id, r, c) {
    const k = key(r, c);
    this.pending.set(k, id);
    this.history.push(k);
    setMessage(this.$msg, '');
  }

  placeAtCursor(id) {
    const { dir } = this.cursor;
    const [dr, dc] = dir === 'H' ? [0, 1] : [1, 0];
    let { r, c } = this.cursor;
    while (inBounds(r, c) && this.filled(r, c)) { r += dr; c += dc; }
    if (!inBounds(r, c)) { setMessage(this.$msg, 'No room left in that direction.', 'error'); shake(this.$board); return; }
    this.place(id, r, c);
    this.cursor = { r: r + dr, c: c + dc, dir };
    if (!inBounds(this.cursor.r, this.cursor.c)) this.cursor = { r, c, dir };
    this.render();
  }

  recall() {
    if (this.status !== 'playing') return;
    this.pending.clear();
    this.history = [];
    this.selected = null;
    this.render();
  }

  shuffle() {
    if (this.status !== 'playing') return;
    this.tiles = shuffle(this.ctx.rng, this.tiles);
    this.render();
  }

  submit() {
    const placed = this.pending.size;
    if (placed < 7) {
      setMessage(this.$msg, `A bingo uses all seven tiles. You've placed ${placed}.`, 'error');
      shake(this.$rack);
      return;
    }
    const result = validatePlay(this.board, this.placements(), this.ctx.dict);
    if (result.ok) {
      this.finish(true, { mainWord: result.mainWord, words: result.words.map((w) => w.word) });
    } else {
      setMessage(this.$msg, result.error, 'error');
      shake(this.$board);
    }
  }

  giveUp() { if (this.status === 'playing') this.finish(false); }

  // ---------- keyboard ----------
  onKey(e) {
    const k = e.key;
    if (k === 'Enter') { e.preventDefault(); this.status === 'playing' ? this.submit() : this.newRound(); return; }
    if (this.status !== 'playing') return;
    if (/^[a-z]$/i.test(k)) {
      const L = k.toUpperCase();
      if (!this.cursor) { setMessage(this.$msg, 'Tap a square first, then type.', 'info'); return; }
      const tile = this.tiles.find((t) => t.letter === L && !this.isUsed(t.id));
      if (tile) this.placeAtCursor(tile.id);
      else { setMessage(this.$msg, `There's no spare ${L} on your rack.`, 'error'); shake(this.$rack); }
    } else if (k === 'Backspace') {
      e.preventDefault();
      const last = this.history.pop();
      if (!last) return;
      this.pending.delete(last);
      const [r, c] = last.split(',').map(Number);
      this.cursor = { r, c, dir: this.cursor?.dir || 'H' };
      this.render();
    } else if (k === 'Escape') this.recall();
    else if (k === ' ') { e.preventDefault(); this.shuffle(); }
    else if (this.cursor && k.startsWith('Arrow')) {
      e.preventDefault();
      const d = { ArrowUp: [-1, 0, 'V'], ArrowDown: [1, 0, 'V'], ArrowLeft: [0, -1, 'H'], ArrowRight: [0, 1, 'H'] }[k];
      const r = this.cursor.r + d[0], c = this.cursor.c + d[1];
      this.cursor = inBounds(r, c) ? { r, c, dir: d[2] } : { ...this.cursor, dir: d[2] };
      this.render();
    }
  }

  // ---------- timer (mode C) ----------
  get timeLimit() { return this.clock * 60000; }

  startTimer() {
    this.stopTimer();
    this.remaining = this.timeLimit;
    this.endsAt = performance.now() + this.remaining;
    if (this.visible) this.runTimer();
    this.drawTimer();
  }
  runTimer() {
    clearInterval(this.interval);
    this.endsAt = performance.now() + this.remaining;
    this.interval = setInterval(() => {
      this.remaining = Math.max(0, this.endsAt - performance.now());
      this.drawTimer();
      if (this.remaining <= 0) { this.stopTimer(); this.finish(false, { timeout: true }); }
    }, 200);
  }
  stopTimer() { clearInterval(this.interval); this.interval = null; }
  drawTimer() {
    if (!this.timed) return;
    const s = Math.ceil(this.remaining / 1000);
    this.$timerText.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.$timerFill.style.transform = `scaleX(${this.remaining / this.timeLimit})`;
    this.$timer.dataset.low = String(this.remaining <= 15000);
    for (const b of this.$seg.querySelectorAll('[data-clock]')) b.setAttribute('aria-checked', String(Number(b.dataset.clock) === this.clock));
  }

  show() {
    this.visible = true;
    if (this.timed && this.status === 'playing' && !this.interval) this.runTimer();
  }
  hide() {
    this.visible = false;
    if (this.timed && this.interval) {
      this.remaining = Math.max(0, this.endsAt - performance.now());
      this.stopTimer(); // the clock pauses while you're in another mode
    }
  }

  // ---------- render ----------
  render() {
    const sol = this.round.solution;
    const solKeys = new Map(sol.placements.map((p) => [key(p.r, p.c), p.letter]));
    const done = this.status !== 'playing';

    for (const cell of this.cells) {
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c), k = key(r, c);
      const prem = premiumAt(r, c);
      let cls = 'cell', html = '', label;
      if (this.board[r][c]) {
        html = tileHTML(this.board[r][c], 'fixed'); label = this.board[r][c];
      } else if (this.pending.has(k)) {
        const L = this.tileById(this.pending.get(k)).letter;
        html = tileHTML(L, this.status === 'solved' ? 'won' : 'pending'); label = `${L}, yours`;
      } else if (this.status === 'revealed' && solKeys.has(k)) {
        html = tileHTML(solKeys.get(k), 'shown'); label = solKeys.get(k);
      } else {
        if (prem) { cls += ` ${prem}`; html = `<span class="prem">${PREMIUM_LABEL[prem]}</span>`; }
        label = 'empty';
      }
      if (!done && this.cursor && this.cursor.r === r && this.cursor.c === c) {
        cls += ' cursor';
        cell.dataset.dir = this.cursor.dir;
      }
      cell.className = cls;
      cell.innerHTML = html;
      cell.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}: ${label}`);
    }

    this.$rack.innerHTML = this.tiles.map((t) => this.isUsed(t.id) || done
      ? `<span class="slot rack-gap"></span>`
      : `<button class="slot ${this.selected === t.id ? 'selected' : ''}" data-id="${t.id}" aria-label="${t.letter}">${tileHTML(t.letter)}</button>`).join('');

    for (const act of ['shuffle', 'recall', 'giveup']) this.$controls.querySelector(`[data-act="${act}"]`).hidden = done;
    this.$controls.querySelector('[data-act="primary"]').textContent = done ? 'Play again' : 'Play word';
  }
}

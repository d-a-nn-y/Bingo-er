// Mode A: find a 7-letter word using every tile on the rack.

import { makeRackRound } from './generators.js';
import { shuffle } from './rng.js';
import { tileHTML, wordTilesHTML, setMessage, shake, tierControlHTML } from './ui.js';

export class RackMode {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { dict, rng, onStats }
    this.id = 'a';
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="mode-head">
        <div class="mode-title-row"><h1>Bingo in rack</h1>${tierControlHTML()}</div>
        <p class="hint">Use all seven tiles to make one word. Tap tiles or type.</p>
      </div>
      <div class="answer" aria-label="Your word"></div>
      <div class="rack" role="group" aria-label="Your rack"></div>
      <p class="message" role="status" aria-live="polite"></p>
      <div class="controls">
        <button class="btn ghost" data-act="shuffle">Shuffle</button>
        <button class="btn ghost" data-act="clear">Clear</button>
        <button class="btn quiet" data-act="giveup">Give up</button>
        <button class="btn primary" data-act="primary">Check word</button>
      </div>
      <div class="reveal" hidden></div>`;
    this.$answer = this.root.querySelector('.answer');
    this.$rack = this.root.querySelector('.rack');
    this.$msg = this.root.querySelector('.message');
    this.$reveal = this.root.querySelector('.reveal');
    this.$controls = this.root.querySelector('.controls');

    this.$rack.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) this.addTile(Number(b.dataset.id));
    });
    this.$answer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pos]');
      if (b) this.removeAt(Number(b.dataset.pos));
    });
    this.$controls.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'shuffle') this.shuffle();
      else if (act === 'clear') this.clear();
      else if (act === 'giveup') this.giveUp();
      else if (act === 'primary') this.status === 'playing' ? this.submit() : this.newRound();
    });
  }

  newRound() {
    const round = makeRackRound(this.ctx.dict, this.ctx.rng, { tier: this.ctx.tier });
    this.round = round;
    this.tiles = round.rack.map((letter, id) => ({ id, letter }));
    this.answer = []; // tile ids in order
    this.status = 'playing';
    this.$reveal.hidden = true;
    setMessage(this.$msg, '');
    this.render();
  }

  // ----- actions -----
  addTile(id) {
    if (this.status !== 'playing' || this.answer.includes(id) || this.answer.length >= 7) return;
    this.answer.push(id);
    setMessage(this.$msg, '');
    this.render();
  }
  removeAt(pos) {
    if (this.status !== 'playing') return;
    this.answer.splice(pos, 1);
    this.render();
  }
  clear() { if (this.status === 'playing') { this.answer = []; this.render(); } }
  shuffle() { if (this.status === 'playing') { this.tiles = shuffle(this.ctx.rng, this.tiles); this.render(); } }

  submit() {
    if (this.answer.length < 7) {
      setMessage(this.$msg, `A bingo uses all seven tiles. You've used ${this.answer.length}.`, 'error');
      shake(this.$answer);
      return;
    }
    const word = this.answer.map((id) => this.tiles.find((t) => t.id === id).letter).join('');
    if (this.ctx.dict.has(word)) {
      this.finish(true, word);
    } else {
      setMessage(this.$msg, `${word} isn't in the word list. Try another arrangement.`, 'error');
      shake(this.$answer);
    }
  }

  giveUp() { if (this.status === 'playing') this.finish(false); }

  finish(won, word) {
    this.status = won ? 'solved' : 'revealed';
    this.ctx.onStats(this.id, won);
    const answers = this.round.answers;
    if (won) {
      setMessage(this.$msg, `Bingo! ${word} is a valid word.`, 'success');
      const others = answers.filter((w) => w !== word);
      this.$reveal.innerHTML = others.length
        ? `<p class="reveal-label">Other bingos on this rack</p><div class="reveal-words">${others.map((w) => wordTilesHTML(w, 'mini')).join('')}</div>`
        : `<p class="reveal-label">That was the only bingo on this rack.</p>`;
    } else {
      // Show the player's rack arrangement of the first answer in the slots.
      const pool = this.tiles.slice();
      this.answer = [...this.round.target].map((l) => {
        const i = pool.findIndex((t) => t.letter === l);
        return pool.splice(i, 1)[0].id;
      });
      setMessage(this.$msg, answers.length > 1 ? `The bingo was ${this.round.target}. This rack has ${answers.length} in total.` : `The bingo was ${this.round.target}.`, 'info');
      this.$reveal.innerHTML = answers.length > 1
        ? `<p class="reveal-label">Every bingo on this rack</p><div class="reveal-words">${answers.map((w) => wordTilesHTML(w, 'mini')).join('')}</div>`
        : '';
    }
    this.$reveal.hidden = !this.$reveal.innerHTML;
    this.render();
  }

  // ----- input -----
  onKey(e) {
    const k = e.key;
    if (k === 'Enter') { e.preventDefault(); this.status === 'playing' ? this.submit() : this.newRound(); return; }
    if (this.status !== 'playing') return;
    if (/^[a-z]$/i.test(k)) {
      const L = k.toUpperCase();
      const tile = this.tiles.find((t) => t.letter === L && !this.answer.includes(t.id));
      if (tile) this.addTile(tile.id);
      else { setMessage(this.$msg, `There's no spare ${L} on your rack.`, 'error'); shake(this.$rack); }
    } else if (k === 'Backspace') { e.preventDefault(); this.answer.pop(); this.render(); }
    else if (k === 'Escape') this.clear();
    else if (k === ' ') { e.preventDefault(); this.shuffle(); }
  }

  // ----- render -----
  render() {
    const done = this.status !== 'playing';
    const tileState = done ? (this.status === 'solved' ? 'won' : 'shown') : 'pending';
    this.$answer.innerHTML = Array.from({ length: 7 }, (_, pos) => {
      const id = this.answer[pos];
      if (id === undefined) return `<span class="slot"></span>`;
      const letter = this.tiles.find((t) => t.id === id).letter;
      return `<button class="slot filled" data-pos="${pos}" aria-label="Remove ${letter}" ${done ? 'disabled' : ''}>${tileHTML(letter, tileState)}</button>`;
    }).join('');

    this.$rack.innerHTML = this.tiles.map((t) => this.answer.includes(t.id)
      ? `<span class="slot rack-gap"></span>`
      : `<button class="slot" data-id="${t.id}" aria-label="${t.letter}" ${done ? 'disabled' : ''}>${tileHTML(t.letter)}</button>`).join('');

    for (const act of ['shuffle', 'clear', 'giveup']) this.$controls.querySelector(`[data-act="${act}"]`).hidden = done;
    this.$controls.querySelector('[data-act="primary"]').textContent = done ? 'Play again' : 'Check word';
  }

  show() {}
  hide() {}
}

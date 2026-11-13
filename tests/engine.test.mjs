// Run with: node tests/engine.test.mjs [path/to/wordlist.txt]
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Dictionary, parseWordList, fitsBag } from '../js/dictionary.js';
import { emptyBoard, applyPlacements, validatePlay, boardLetters } from '../js/board.js';
import { makeRackRound, makeStarterRound, makeTimedRound } from '../js/generators.js';
import { seeded } from '../js/rng.js';

const path = process.argv[2] || new URL('../data/sample-words.txt', import.meta.url);
let t = performance.now();
const dict = new Dictionary(parseWordList(readFileSync(path, 'utf8')));
console.log(`Loaded ${dict.size} words in ${(performance.now() - t).toFixed(0)} ms`);

// --- validator unit checks ---
const tiny = new Dictionary(new Set(['CAT', 'CATS', 'AT', 'TA', 'SAT', 'AS']));
let b = applyPlacements(emptyBoard(), [...'CAT'].map((l, i) => ({ r: 7, c: 6 + i, letter: l })));
assert.equal(validatePlay(b, [{ r: 7, c: 9, letter: 'S' }], tiny).mainWord, 'CATS');
assert.equal(validatePlay(b, [{ r: 7, c: 9, letter: 'S' }], tiny).ok, true);
assert.equal(validatePlay(b, [{ r: 7, c: 10, letter: 'S' }], tiny).ok, false); // gap / not connected
assert.equal(validatePlay(b, [{ r: 8, c: 7, letter: 'S' }], tiny).ok, true);  // AS down
assert.equal(validatePlay(b, [{ r: 8, c: 7, letter: 'X' }], tiny).ok, false);
assert.equal(validatePlay(b, [{ r: 5, c: 5, letter: 'A' }, { r: 6, c: 6, letter: 'T' }], tiny).ok, false); // diagonal
assert.equal(validatePlay(emptyBoard(), [{ r: 0, c: 0, letter: 'A' }, { r: 0, c: 1, letter: 'T' }], tiny).ok, false); // centre rule
console.log('validator checks passed');

// --- generator soak tests ---
const rng = seeded(42);
function soak(name, make, n, check, d = dict) {
  const start = performance.now(); let slowest = 0;
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    const round = make(d, rng);
    slowest = Math.max(slowest, performance.now() - s);
    check(round);
  }
  console.log(`${name}: ${n} rounds ok, avg ${((performance.now() - start) / n).toFixed(1)} ms, slowest ${slowest.toFixed(0)} ms`);
}

soak("Mode A", (d, r) => makeRackRound(d, r), 500, (r) => {
  assert.equal(r.rack.length, 7);
  assert.ok(r.answers.includes(r.target));
  assert.ok(dict.has(r.target));
  assert.ok(!r.answers.includes(r.rack.join('')) || r.answers.length === 0);
});

const boardCheck = (minTilesBefore) => (r) => {
  assert.equal(r.rack.length, 7);
  const v = validatePlay(r.board, r.solution.placements, dict);
  assert.ok(v.ok, v.error);
  assert.deepEqual([...r.rack].sort(), r.solution.placements.map((p) => p.letter).sort());
  assert.ok(fitsBag(boardLetters(r.board) + r.rack.join('')));
  assert.ok(boardLetters(r.board).length >= minTilesBefore);
};
soak('Mode B', makeStarterRound, 300, boardCheck(2));
soak('Mode C', makeTimedRound, 150, boardCheck(4));

const lens = {}; for (let i = 0; i < 200; i++) { const r = makeStarterRound(dict, rng); lens[r.solution.word.length] = (lens[r.solution.word.length] || 0) + 1; }
console.log('Mode B bingo lengths:', lens);
const tiles = []; for (let i = 0; i < 50; i++) tiles.push(boardLetters(makeTimedRound(dict, rng).board).length);
console.log('Mode C tiles on board before bingo: min', Math.min(...tiles), 'max', Math.max(...tiles));

// --- Easy / Hard tiers ---
// Mark every other 7/8-letter word as "easy" to check tiers are respected.
const allWords = parseWordList(readFileSync(path, 'utf8'));
const easyWords = new Set([...allWords].filter((w) => w.length === 7 || w.length === 8).filter((_, i) => i % 2 === 0));
const tiered = new Dictionary(allWords, { easyWords, minTierPool: 5 });
assert.ok(tiered.hasTiers, 'tiers should be available');
assert.ok(!new Dictionary(allWords, { easyWords: new Set(['RETAINS']) }).hasTiers, 'tiny easy list disables tiers');
for (const tier of ['easy', 'hard']) {
  const inTier = (w) => (tier === 'easy') === easyWords.has(w);
  let fallbacks = 0;
  soak(`Mode A ${tier}`, (d, r) => makeRackRound(d, r, { tier }), 300, (r) => assert.ok(inTier(r.target)), tiered);
  for (const [name, make] of [['B', makeStarterRound], ['C', makeTimedRound]]) {
    soak(`Mode ${name} ${tier}`, (d, r) => make(d, r, tier), name === 'B' ? 200 : 80, (r) => {
      boardCheck(2)(r);
      if (r.tier === tier) assert.ok(inTier(r.solution.word), `${r.solution.word} not ${tier}`);
      else fallbacks++;
    }, tiered);
  }
  console.log(`  ${tier}: ${fallbacks} board rounds fell back to any bingo`);
}

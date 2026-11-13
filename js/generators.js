// Puzzle generators. Every puzzle is built backwards from a real bingo, then the
// answer is re-checked with the same validator the player's moves go through,
// so a round can never be a trick question.

import { ALPHABET, fitsBag } from './dictionary.js';
import {
  CENTRE, emptyBoard, applyPlacements, occupiedCells, anchorCells, boardLetters,
  inBounds, validatePlay,
} from './board.js';
import { pick, randInt, shuffle } from './rng.js';

const RACK_SIZE = 7;

// ---------- Mode A: bingo in rack ----------

export function makeRackRound(dict, rng, { tier = 'all' } = {}) {
  const pool = dict.pool(7, tier);
  if (!pool?.length) throw new Error('The word list has no 7-letter words.');
  const target = pick(rng, pool);
  const answers = dict.anagramsOf(target);
  let rack = shuffle(rng, target.split(''));
  // Don't hand the player a rack that already spells an answer.
  for (let i = 0; i < 10 && answers.includes(rack.join('')); i++) rack = shuffle(rng, rack);
  return { rack, target, answers };
}

// ---------- Board helpers ----------

const positionsOf = (word, letter) => [...word].flatMap((ch, i) => (ch === letter ? [i] : []));

/**
 * Lay `word` along `dir` so that word[k] lands on (r, c).
 * Returns the new tiles needed, or null if it runs off the board or clashes
 * with a different letter already there.
 */
function layout(board, word, r, c, k, dir) {
  const [dr, dc] = dir === 'H' ? [0, 1] : [1, 0];
  const placements = [];
  for (let i = 0; i < word.length; i++) {
    const rr = r + (i - k) * dr, cc = c + (i - k) * dc;
    if (!inBounds(rr, cc)) return null;
    const existing = board[rr][cc];
    if (existing) { if (existing !== word[i]) return null; }
    else placements.push({ r: rr, c: cc, letter: word[i] });
  }
  return placements;
}

/** Letters that can legally sit on (r, c) given its neighbours along a direction. */
function crossCheck(board, r, c, dir, dict) {
  const [dr, dc] = dir === 'H' ? [0, 1] : [1, 0];
  let before = '', after = '';
  for (let rr = r - dr, cc = c - dc; inBounds(rr, cc) && board[rr][cc]; rr -= dr, cc -= dc) before = board[rr][cc] + before;
  for (let rr = r + dr, cc = c + dc; inBounds(rr, cc) && board[rr][cc]; rr += dr, cc += dc) after += board[rr][cc];
  if (!before && !after) return ALPHABET;
  return ALPHABET.filter((x) => dict.has(before + x + after));
}

const bagAllows = (board, placements) => fitsBag(boardLetters(board) + placements.map((p) => p.letter).join(''));

// ---------- Board building ----------

const SHORT_LENGTHS = [2, 3, 3, 4, 4, 4, 5, 5, 6];

export function buildBoard(dict, rng, { moves = 1, firstLen = [3, 6] } = {}) {
  let board = emptyBoard();

  // Opening word across the centre star.
  const lengths = [];
  for (let n = firstLen[0]; n <= firstLen[1]; n++) if (dict.byLen[n]?.length) lengths.push(n);
  if (!lengths.length) return null;
  const len = pick(rng, lengths);
  const opener = pick(rng, dict.byLen[len]);
  const start = CENTRE - randInt(rng, 0, len - 1);
  board = applyPlacements(board, [...opener].map((letter, i) => ({ r: CENTRE, c: start + i, letter })));

  for (let m = 1; m < moves; m++) {
    const tiles = occupiedCells(board);
    for (let attempt = 0; attempt < 300; attempt++) {
      const t = pick(rng, tiles);
      const letter = board[t.r][t.c];
      const candidates = dict.containing[pick(rng, SHORT_LENGTHS)]?.[letter];
      if (!candidates?.length) continue;
      const word = pick(rng, candidates);
      const dir = rng() < 0.5 ? 'H' : 'V';
      const placements = layout(board, word, t.r, t.c, pick(rng, positionsOf(word, letter)), dir);
      if (!placements || !placements.length || placements.length >= RACK_SIZE) continue;
      if (!bagAllows(board, placements)) continue;
      if (!validatePlay(board, placements, dict).ok) continue;
      board = applyPlacements(board, placements);
      break;
    }
  }
  return board;
}

// ---------- Hiding a bingo on the board ----------

function tryThroughBingo(board, dict, rng, tier) {
  // An 8-letter word built through exactly one tile already on the board.
  const t = pick(rng, occupiedCells(board));
  const letter = board[t.r][t.c];
  const candidates = dict.poolContaining(8, letter, tier);
  if (!candidates?.length) return null;
  const word = pick(rng, candidates);
  const dir = rng() < 0.5 ? 'H' : 'V';
  const placements = layout(board, word, t.r, t.c, pick(rng, positionsOf(word, letter)), dir);
  return placements && { word, placements };
}

function tryHookBingo(board, dict, rng, tier) {
  // A 7-letter word laid on empty squares, touching the board as a hook or parallel play.
  const h = pick(rng, anchorCells(board));
  if (!h) return null;
  const filled = (r, c) => inBounds(r, c) && board[r][c];
  const hasH = filled(h.r, h.c - 1) || filled(h.r, h.c + 1);
  const hasV = filled(h.r - 1, h.c) || filled(h.r + 1, h.c);
  if (hasH === hasV) return null; // corner squares: keep it simple, try elsewhere
  const dir = hasV ? 'H' : 'V';   // run the bingo across the neighbouring word
  const allowed = crossCheck(board, h.r, h.c, dir === 'H' ? 'V' : 'H', dict);
  if (!allowed.length) return null;
  const x = pick(rng, allowed);
  const candidates = dict.poolContaining(7, x, tier);
  if (!candidates?.length) return null;
  const word = pick(rng, candidates);
  const placements = layout(board, word, h.r, h.c, pick(rng, positionsOf(word, x)), dir);
  return placements && { word, placements };
}

export function hideBingo(board, dict, rng, { hookBias = 0.4, attempts = 1500, tier = 'all' } = {}) {
  for (let i = 0; i < attempts; i++) {
    const found = rng() < hookBias ? tryHookBingo(board, dict, rng, tier) : tryThroughBingo(board, dict, rng, tier);
    if (!found) continue;
    const { placements } = found;
    if (placements.length !== RACK_SIZE) continue;
    if (!bagAllows(board, placements)) continue;
    const check = validatePlay(board, placements, dict);
    // The main word must be exactly the word we picked, so it stays in the chosen tier.
    if (!check.ok || check.mainWord !== found.word) continue;
    return {
      placements,
      word: check.mainWord,
      words: check.words.map((w) => w.word),
      rack: shuffle(rng, placements.map((p) => p.letter)),
    };
  }
  return null;
}

// ---------- Modes B and C ----------

export function makeBoardRound(dict, rng, { moves = 1, firstLen = [3, 6], hookBias = 0.4, tier = 'all' } = {}) {
  // Try the chosen tier first; fall back to any bingo rather than fail to deal a round.
  for (const t of tier === 'all' ? ['all'] : [tier, 'all']) {
    for (let tries = 0; tries < 40; tries++) {
      const board = buildBoard(dict, rng, { moves, firstLen });
      if (!board) continue;
      const solution = hideBingo(board, dict, rng, { hookBias, tier: t });
      if (solution) return { board, rack: solution.rack, solution, tier: t };
    }
  }
  throw new Error('Could not build a puzzle from this word list. Try a larger list.');
}

export const makeStarterRound = (dict, rng, tier = 'all') =>
  makeBoardRound(dict, rng, { moves: 1, firstLen: [3, 6], hookBias: 0.45, tier });

export const makeTimedRound = (dict, rng, tier = 'all') =>
  makeBoardRound(dict, rng, { moves: randInt(rng, 5, 8), firstLen: [4, 7], hookBias: 0.35, tier });

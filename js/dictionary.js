// Word list parsing and the indexes the generators need.

export const LETTER_POINTS = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

// Standard English tile distribution (blanks excluded: the app doesn't use them).
export const TILE_COUNTS = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4, M: 2,
  N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Accepts most word-list formats: one word per line, optionally followed by a
 * definition or other columns. Only the first run of letters on each line is kept.
 */
export function parseWordList(text) {
  const words = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z]+)/.exec(line);
    if (!m) continue;
    const w = m[1].toUpperCase();
    if (w.length >= 2 && w.length <= 15) words.add(w);
  }
  return words;
}

export function letterCounts(letters, into = {}) {
  for (const ch of letters) into[ch] = (into[ch] || 0) + 1;
  return into;
}

const BAG_LIMITS = new Uint8Array(26);
for (const ch in TILE_COUNTS) BAG_LIMITS[ch.charCodeAt(0) - 65] = TILE_COUNTS[ch];
const scratch = new Uint8Array(26);

/** True if the letters could all come from one physical tile bag. */
export function fitsBag(letters) {
  scratch.fill(0);
  for (let i = 0; i < letters.length; i++) {
    const k = letters.charCodeAt(i) - 65;
    if (++scratch[k] > BAG_LIMITS[k]) return false;
  }
  return true;
}

export const sortKey = (w) => w.split('').sort().join('');

export class Dictionary {
  /**
   * @param words      Set or array of words
   * @param easyWords  optional Set of 7/8-letter words that count as Easy; every
   *                   other bingo is Hard. Without it there's a single pool.
   * @param minTierPool smallest usable Easy/Hard pool before tiers are switched off
   */
  constructor(words, { easyWords = null, minTierPool = 200 } = {}) {
    this.words = words instanceof Set ? words : new Set(words);
    this.byLen = {};      // len -> words (tile-bag legal, len 2..8) used by generators
    this.containing = {}; // len -> letter -> words containing that letter
    this.anagrams = new Map(); // sorted letters -> all 7/8-letter words

    for (const w of this.words) {
      const len = w.length;
      if (len > 8) continue;
      if (len === 7 || len === 8) {
        const k = sortKey(w);
        const list = this.anagrams.get(k);
        if (list) list.push(w); else this.anagrams.set(k, [w]);
      }
      if (!fitsBag(w)) continue;
      (this.byLen[len] ||= []).push(w);
      const idx = (this.containing[len] ||= {});
      for (const ch of new Set(w)) (idx[ch] ||= []).push(w);
    }
    for (const list of this.anagrams.values()) list.sort();
    this.minTierPool = minTierPool;
    this.setEasyWords(easyWords);
  }

  /** Split the 7- and 8-letter bingo pools into Easy (listed words) and Hard (the rest). */
  setEasyWords(easyWords) {
    this.tiers = null;
    this.tierCounts = null;
    if (!easyWords?.size) return;
    const tiers = { easy: { pool: {}, idx: {} }, hard: { pool: {}, idx: {} } };
    for (const len of [7, 8]) {
      for (const t of Object.values(tiers)) { t.pool[len] = []; t.idx[len] = {}; }
      for (const w of this.byLen[len] || []) {
        const t = easyWords.has(w) ? tiers.easy : tiers.hard;
        t.pool[len].push(w);
        for (const ch of new Set(w)) (t.idx[len][ch] ||= []).push(w);
      }
    }
    const counts = {
      easy: tiers.easy.pool[7].length + tiers.easy.pool[8].length,
      hard: tiers.hard.pool[7].length + tiers.hard.pool[8].length,
    };
    const usable = [7, 8].every((len) =>
      tiers.easy.pool[len].length >= this.minTierPool && tiers.hard.pool[len].length >= this.minTierPool);
    if (usable) { this.tiers = tiers; this.tierCounts = counts; }
  }

  /** True when Easy and Hard are both available for this word list. */
  get hasTiers() { return !!this.tiers; }

  /** Bingo candidates of a length for a tier ('easy', 'hard' or 'all'). */
  pool(len, tier = 'all') {
    return this.tiers?.[tier]?.pool[len] || this.byLen[len] || [];
  }

  /** Bingo candidates of a length for a tier that contain a letter. */
  poolContaining(len, letter, tier = 'all') {
    const t = this.tiers?.[tier];
    return t ? t.idx[len]?.[letter] : this.containing[len]?.[letter];
  }

  get size() { return this.words.size; }

  has(word) { return this.words.has(word); }

  /** All 7- or 8-letter words using exactly these letters. */
  anagramsOf(letters) {
    return this.anagrams.get(sortKey(Array.isArray(letters) ? letters.join('') : letters)) || [];
  }

  countOfLength(len) { return this.byLen[len]?.length || 0; }
}

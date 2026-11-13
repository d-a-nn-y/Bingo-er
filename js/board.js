// Board model and the move validator shared by the generators and the UI.
// The same validator that checks the player's move also checks every generated
// puzzle, which is what guarantees there is always a real bingo available.

export const SIZE = 15;
export const CENTRE = 7;

// Top-left quadrant of the standard board; the rest is mirrored.
// T = triple word, D = double word, t = triple letter, d = double letter, * = centre.
const QUADRANT = [
  'T..d...T',
  '.D...t..',
  '..D...d.',
  'd..D...d',
  '....D...',
  '.t...t..',
  '..d...d.',
  'T..d...*',
];
const PREMIUM_NAMES = { T: 'tw', D: 'dw', t: 'tl', d: 'dl', '*': 'star' };

export function premiumAt(r, c) {
  const qr = r <= CENTRE ? r : SIZE - 1 - r;
  const qc = c <= CENTRE ? c : SIZE - 1 - c;
  return PREMIUM_NAMES[QUADRANT[qr][qc]] || null;
}

export const emptyBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
export const cloneBoard = (b) => b.map((row) => row.slice());
export const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const isBoardEmpty = (b) => b.every((row) => row.every((x) => !x));

export function applyPlacements(board, placements) {
  const next = cloneBoard(board);
  for (const p of placements) next[p.r][p.c] = p.letter;
  return next;
}

export function occupiedCells(board) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) out.push({ r, c });
  return out;
}

/** Empty squares touching at least one tile: the places a new word can connect. */
export function anchorCells(board) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => inBounds(r + dr, c + dc) && board[r + dr][c + dc])) {
        out.push({ r, c });
      }
    }
  }
  return out;
}

export const boardLetters = (board) => board.flat().filter(Boolean).join('');

/** The full run of tiles through (r, c) along a direction, in the given grid. */
function runAt(grid, r, c, dr, dc) {
  let sr = r, sc = c;
  while (inBounds(sr - dr, sc - dc) && grid[sr - dr][sc - dc]) { sr -= dr; sc -= dc; }
  const cells = [];
  let word = '';
  let rr = sr, cc = sc;
  while (inBounds(rr, cc) && grid[rr][cc]) {
    cells.push({ r: rr, c: cc });
    word += grid[rr][cc];
    rr += dr; cc += dc;
  }
  return { word, cells };
}

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/**
 * Validate placing `placements` ([{r, c, letter}]) on `board`.
 * Returns { ok, error?, mainWord, words: [{word, cells}], invalid: [] }.
 */
export function validatePlay(board, placements, dict) {
  if (!placements.length) return fail('Place some tiles first.');

  const seen = new Set();
  for (const p of placements) {
    if (!inBounds(p.r, p.c)) return fail('A tile is off the board.');
    if (board[p.r][p.c]) return fail('That square is already taken.');
    const key = `${p.r},${p.c}`;
    if (seen.has(key)) return fail('Two tiles are on the same square.');
    seen.add(key);
  }

  const grid = applyPlacements(board, placements);
  const rows = new Set(placements.map((p) => p.r));
  const cols = new Set(placements.map((p) => p.c));

  let dir;
  if (placements.length === 1) {
    const { r, c } = placements[0];
    dir = runAt(grid, r, c, 0, 1).word.length > 1 ? 'H' : 'V';
  } else if (rows.size === 1) dir = 'H';
  else if (cols.size === 1) dir = 'V';
  else return fail('Tiles must go in one row or one column.');

  const [dr, dc] = dir === 'H' ? [0, 1] : [1, 0];
  const sorted = placements.slice().sort((a, b) => (dir === 'H' ? a.c - b.c : a.r - b.r));
  const first = sorted[0], last = sorted[sorted.length - 1];
  for (let r = first.r, c = first.c; r <= last.r && c <= last.c; r += dr, c += dc) {
    if (!grid[r][c]) return fail('Leave no gaps: your tiles must make one unbroken word.');
  }

  const main = runAt(grid, first.r, first.c, dr, dc);
  const words = [];
  if (main.word.length > 1) words.push(main);
  for (const p of placements) {
    const cross = runAt(grid, p.r, p.c, dc, dr);
    if (cross.word.length > 1) words.push(cross);
  }
  if (!words.length) return fail('Make a word of at least two letters.');

  if (isBoardEmpty(board)) {
    if (!placements.some((p) => p.r === CENTRE && p.c === CENTRE)) {
      return fail('The first word must cover the centre star.');
    }
  } else {
    const connected = words.some((w) => w.cells.some(({ r, c }) => board[r][c]));
    if (!connected) return fail('Your word must connect to tiles already on the board.');
  }

  const invalid = words.filter((w) => !dict.has(w.word)).map((w) => w.word);
  const result = { mainWord: main.word.length > 1 ? main.word : words[0].word, words, invalid };
  if (invalid.length) {
    const list = invalid.join(', ');
    return { ok: false, error: `${list} ${invalid.length > 1 ? "aren't" : "isn't"} in the word list.`, ...result };
  }
  return { ok: true, ...result };
}

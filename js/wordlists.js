// Where the word list comes from, in priority order:
//   1. A list the player loaded themselves (saved on this device in IndexedDB)
//   2. data/words.txt: a developer override for local practice (git-ignored)
//   3. data/enable.txt: the bundled, public-domain ENABLE list (the default)
//   4. data/sample-words.txt: a tiny demo list, used only if ENABLE isn't installed

export const BUILT_IN = [
  { id: 'dev', name: 'Your words.txt', url: 'data/words.txt' },
  { id: 'enable', name: 'ENABLE', url: 'data/enable.txt' },
  { id: 'demo', name: 'Demo list', url: 'data/sample-words.txt' },
];

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  if (!text.trim()) throw new Error(`${url} is empty`);
  return text;
}

/** First built-in list that exists, skipping any ids in `skip`. */
export async function loadBuiltIn(skip = []) {
  for (const src of BUILT_IN) {
    if (skip.includes(src.id)) continue;
    try { return { id: src.id, name: src.name, text: await fetchText(src.url) }; } catch { /* try the next one */ }
  }
  throw new Error('No word list found.');
}

/**
 * Words that count as Easy bingos (built by scripts/build_easy.py). Applies to
 * whichever word list is active; any bingo not listed is Hard.
 * Returns null if the file isn't there, in which case there's no Easy/Hard split.
 */
export async function loadEasyWords() {
  try {
    const text = await fetchText('data/easy-bingos.txt');
    return new Set(text.split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter(Boolean));
  } catch {
    return null;
  }
}

// ---------- saved custom list (IndexedDB) ----------

const DB = 'bingoer';
const STORE = 'wordlists';
const KEY = 'custom';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSavedList() {
  try {
    const saved = await withStore('readonly', (s) => s.get(KEY));
    return saved?.text ? { id: 'custom', name: saved.name, text: saved.text } : null;
  } catch {
    return null;
  }
}

export const saveList = (name, text) =>
  withStore('readwrite', (s) => s.put({ name, text, savedAt: Date.now() }, KEY));

export const clearSavedList = () => withStore('readwrite', (s) => s.delete(KEY));

# Bingo-er

Practise Scrabble bingos in three modes:

- **A · Bingo in rack**: make a 7-letter word from 7 tiles.
- **B · Bingo on board**: play all 7 tiles off a single starter word, either hooking onto it (7-letter bingo) or building through one of its letters (8-letter bingo).
- **C · Timed board play**: find a bingo on a board that already has several moves on it, with a 3, 2 or 1 minute clock.

Every mode has an **Easy / Hard** switch. Easy deals bingos that are common everyday words; Hard deals all the rest. Streaks are tracked separately for each.

Every puzzle is built backwards from a real bingo, and the hidden answer is re-checked with the same validator your moves go through, so there is always a bingo. Any other valid bingo you find is accepted too.

## Run it

It's plain HTML/CSS/JS modules with no build step, but it must be served over HTTP (browsers block `fetch` from `file://`):

```bash
cd bingo-er
python3 -m http.server 8000
# open http://localhost:8000
```

## Word lists

The app ships with **ENABLE**, a public-domain list of about 173,000 North American English words that has been used by commercial word games. It isn't Collins, so some Collins-only words are missing.

**Install ENABLE once** (downloads it into `data/enable.txt`, standard library only):

```bash
python3 scripts/get_enable.py
```

The script tries a couple of mirrors and checks the word count and a few known words before saving. `data/enable.txt` is public domain, so commit it and ship it with the app.

The app picks the first list it finds, in this order:

1. **A list the player loaded**: tap the word-list chip next to the logo, then "Load your own list". It's saved on the device (IndexedDB) and survives reloads. "Remove my list" goes back to the default. This is how players with their own Collins copy can use it, without you distributing it.
2. **`data/words.txt`**: a developer override for your own local practice. It's git-ignored.
3. **`data/enable.txt`**: the default.
4. **`data/sample-words.txt`**: a ~1,000-word demo list, used only if ENABLE isn't installed. A banner says so.

Any plain text file with one word per line works; case doesn't matter, and anything after the first word on a line (definitions etc.) is ignored. The whole list is loaded, because board play needs 2- to 15-letter words to check hooks and cross-words.

## Easy and Hard

Easy bingos are the 7- and 8-letter words that turn up often in everyday English, measured with the [wordfreq](https://github.com/rspeer/wordfreq) library. Every other bingo is Hard. Build the split once, after installing ENABLE:

```bash
python3 -m pip install wordfreq
python3 scripts/build_easy.py
```

This writes `data/easy-bingos.txt`. It prints how many words each frequency cut-off gives, plus the words just either side of yours, so you can tune it:

```bash
python3 scripts/build_easy.py --min-zipf 3.0   # stricter: fewer, more familiar Easy words
python3 scripts/build_easy.py --min-zipf 2.0   # looser
```

The Zipf scale is logarithmic: 3.0 is about once per million words, 2.5 (the default) about once per three million. Commit `data/easy-bingos.txt` and ship it.

- The split applies to whatever list is active, so a player's own list works too: its words that are in the Easy file are Easy, everything else (including list-only words) is Hard.
- If the file is missing, or a list would leave Easy or Hard with fewer than 200 bingos of either length, the switch is hidden and every bingo is in play.
- Hard only ever hides a Hard word, but any valid bingo you find is accepted.
- The wordfreq word data is licensed CC BY-SA 4.0, so credit it in the app's about screen or store listing (for example: "Word frequencies from wordfreq by Robyn Speer, CC BY-SA 4.0") and check its licence before release.

Word frequencies from wordfreq by Robyn Speer, licensed CC BY-SA 4.0.

## Controls

| | Mode A | Modes B and C |
|---|---|---|
| Place tiles | Tap rack tiles, or type | Tap a square, then tap tiles or type. Tap the square again to switch between across and down. Or tap a tile, then a square. |
| Take back | Tap the tile in your word, or Backspace | Tap your tile on the board, or Backspace |
| Clear all | Clear / Esc | Recall / Esc |
| Shuffle | Space | Space |
| Check / next round | Enter | Enter |
| Move cursor | | Arrow keys |

## How puzzles are generated

- **Mode A**: pick a random 7-letter word, shuffle it (never into an answer), accept any anagram. On give-up it shows every bingo on the rack.
- **Board modes** (`js/generators.js`):
  1. Build a board: an opening word across the centre star, then (mode C) 4–7 more short words crossing existing tiles. Each move is checked with `validatePlay`, so every word and cross-word on the board is real.
  2. Hide a bingo: either an 8-letter word through exactly one existing tile, or a 7-letter word laid on empty squares that hooks or runs parallel, using cross-checks to pick legal hook letters.
  3. Confirm the bingo with `validatePlay`; the rack is its 7 new tiles, shuffled.
- All letters on the board plus the rack fit a real tile bag (no blanks), so you never see impossible positions.

## Tests

```bash
node tests/engine.test.mjs                   # demo list
node tests/engine.test.mjs data/enable.txt   # ENABLE
```

Runs validator unit checks, then generates hundreds of rounds per mode and re-validates each answer.

## Project layout

```
index.html
css/styles.css
js/
  main.js         loading, dock, keyboard routing
  dictionary.js   parsing, anagram and letter indexes, tile values and bag
  board.js        premium squares, move validator
  generators.js   puzzle generation for all modes
  rackMode.js     mode A
  boardMode.js    modes B and C (timer included)
  ui.js           tile rendering, streak stats
  rng.js          seeded/random helpers
  wordlists.js    which list to load, saving a player's own list
scripts/
  get_enable.py   downloads ENABLE into data/
  build_easy.py   splits bingos into Easy and Hard
data/
  enable.txt      (created by scripts/get_enable.py)
  easy-bingos.txt (created by scripts/build_easy.py)
  sample-words.txt
  words.txt       (optional, yours, git-ignored)
tests/engine.test.mjs
```

## Getting to the App Store

Because there's no framework or build step, the simplest path is to wrap it with [Capacitor](https://capacitorjs.com): `npm init`, `npm i @capacitor/core @capacitor/cli @capacitor/ios`, `npx cap init`, point `webDir` at this folder (or copy it into `www/`), `npx cap add ios`, then open in Xcode. Before release you'll want to self-host the font (it currently loads from Google Fonts) and ship the word list inside the bundle.

Two things to sort out before publishing:

- **Word list licence.** The app ships ENABLE, which is public domain, so there's nothing to license. Players can load their own list on their device. Don't bundle Collins or advertise the app as containing it unless you license it from HarperCollins; saying players "can use their own word list" is fine.
- **Trademark.** "Scrabble" is a trademark of Hasbro (US and Canada) and Mattel (elsewhere). Keep it out of the app name, icon and store listing; describe it as practice for "word game bingos" instead.

#!/usr/bin/env python3
"""Download the public-domain ENABLE word list into data/enable.txt.

Run from anywhere:  python3 scripts/get_enable.py
Uses only the standard library. Tries a few mirrors and checks the file
looks right before saving it.
"""
import pathlib
import re
import sys
import urllib.request

MIRRORS = [
    "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt",
    "https://norvig.com/ngrams/enable1.txt",
]
EXPECTED_WORDS = 172_823
MUST_CONTAIN = {"aardvark", "retains", "zebra", "quiz"}
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "enable.txt"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "bingo-er/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8")


def check(text):
    words = [w.strip().lower() for w in text.splitlines() if w.strip()]
    if not 170_000 <= len(words) <= 175_000:
        return None, f"expected about {EXPECTED_WORDS:,} words, got {len(words):,}"
    if not all(re.fullmatch(r"[a-z]+", w) for w in words):
        return None, "found lines that aren't plain lowercase words"
    missing = MUST_CONTAIN - set(words)
    if missing:
        return None, f"missing expected words: {', '.join(sorted(missing))}"
    return words, None


def main():
    for url in MIRRORS:
        print(f"Downloading {url} ...")
        try:
            words, problem = check(fetch(url))
        except Exception as err:  # network errors, bad encoding, etc.
            print(f"  failed: {err}")
            continue
        if problem:
            print(f"  skipped: {problem}")
            continue
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text("\n".join(words) + "\n", encoding="utf-8")
        print(f"Saved {len(words):,} words to {OUT}")
        return 0
    print("Couldn't download ENABLE from any mirror. Check your connection and try again.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

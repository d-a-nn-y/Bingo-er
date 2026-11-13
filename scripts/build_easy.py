#!/usr/bin/env python3
"""Decide which bingos are Easy, using how often each word appears in everyday English.

    python3 -m pip install wordfreq
    python3 scripts/build_easy.py                  # uses data/enable.txt
    python3 scripts/build_easy.py --min-zipf 3.0   # stricter Easy

Writes data/easy-bingos.txt: the 7- and 8-letter words common enough to count as
Easy. The app treats every other bingo in the active word list as Hard, so this one
file also works if a player loads a different list.

Frequencies come from the wordfreq library (Zipf scale: 3.0 is about once per
million words, 2.0 about once per ten million). The script prints how many words
each threshold gives, plus words either side of your cut-off, so you can tune it.
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_LIST = ROOT / "data" / "enable.txt"
OUT = ROOT / "data" / "easy-bingos.txt"


def read_bingos(paths):
    words = set()
    for path in paths:
        for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if parts and parts[0].isalpha() and len(parts[0]) in (7, 8):
                words.add(parts[0].lower())
    return words


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("lists", nargs="*", default=[str(DEFAULT_LIST)], help="word list files (default: data/enable.txt)")
    parser.add_argument("--min-zipf", type=float, default=2.5, help="lowest Zipf frequency that counts as Easy (default 2.5)")
    args = parser.parse_args()

    try:
        from wordfreq import zipf_frequency
    except ImportError:
        print("This script needs wordfreq. Install it with:  python3 -m pip install wordfreq")
        return 1

    missing = [p for p in args.lists if not pathlib.Path(p).exists()]
    if missing:
        print(f"Can't find {', '.join(missing)}. Run scripts/get_enable.py first, or pass a word list path.")
        return 1

    bingos = read_bingos(args.lists)
    if not bingos:
        print("No 7- or 8-letter words found in the list.")
        return 1
    print(f"Scoring {len(bingos):,} bingos...")
    scores = {w: zipf_frequency(w, "en") for w in bingos}

    print("\nZipf cut-off   Easy 7s   Easy 8s   Share of all bingos")
    for cut in (2.0, 2.25, 2.5, 2.75, 3.0, 3.5):
        n7 = sum(1 for w, z in scores.items() if z >= cut and len(w) == 7)
        n8 = sum(1 for w, z in scores.items() if z >= cut and len(w) == 8)
        mark = "  <- chosen" if abs(cut - args.min_zipf) < 1e-9 else ""
        print(f"  {cut:>4}        {n7:>7,}   {n8:>7,}   {(n7 + n8) / len(bingos):>6.1%}{mark}")

    easy = sorted(w for w, z in scores.items() if z >= args.min_zipf)
    ranked = sorted(scores.items(), key=lambda kv: kv[1])
    just_above = [w for w, z in ranked if z >= args.min_zipf][:12]
    just_below = [w for w, z in ranked if z < args.min_zipf][-12:]
    print(f"\nJust made Easy:  {', '.join(just_above)}")
    print(f"Just missed:     {', '.join(just_below)}")

    OUT.write_text("\n".join(w.upper() for w in easy) + "\n", encoding="utf-8")
    print(f"\nSaved {len(easy):,} Easy bingos to {OUT} ({len(bingos) - len(easy):,} are Hard).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

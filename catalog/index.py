#!/usr/bin/env python3
"""Precompute each work's search tokens, so a tool call never tokenises the catalog.

    python3 catalog/index.py          # rewrites worker/src/catalog/<artist>.json in place

WHY. Workers Free gives a request 10 ms of CPU. Tokenising ~9,000 titles and tag lists on a cold
isolate costs several times that, and isolates go cold often. So the build writes three
space-padded strings per work, and search.ts only does substring checks against them:
  kt  tag tokens        (weight 3)
  kn  title tokens      (weight 2)
  ko  medium, institution, description tokens (weight 1)

The tokeniser below MUST match tokens()/stem() in worker/src/search.ts; the stopword list is
read out of worker/src/search.ts, and `npm test` checks the two agree on real titles.
Also drops build-only fields (w, h) the Worker doesn't need. build.py calls this at the end.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAT = ROOT / "worker" / "src" / "catalog"
_SRC = (ROOT / "worker" / "src" / "search.ts").read_text()
_LIT = re.search(r"const STOP = new Set\(\s*\((.*?)\)\.split", _SRC, re.S).group(1)
STOP = set("".join(re.findall(r'"([^"]*)"', _LIT)).split())  # the list lives in search.ts


def stem(w: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", w) if not ("\u0300" <= c <= "\u036f")).lower()
    if len(s) > 4 and s.endswith("ies"):
        s = s[:-3] + "y"
    elif len(s) > 5 and s.endswith("ing"):
        s = s[:-3]
    elif len(s) > 4 and s.endswith("es") and re.search(r"(ss|x|ch|sh)es$", s):
        s = s[:-2]
    elif len(s) > 3 and s.endswith("s") and not s.endswith("ss"):
        s = s[:-1]
    return s


def tokens(text: str) -> list[str]:
    return [stem(w) for w in re.findall(r"[^\W_]+", (text or "").lower()) if len(w) > 1 and w not in STOP]


def pad(ts: list[str]) -> str:
    return " " + " ".join(dict.fromkeys(ts)) + " "


def index_catalog(path: pathlib.Path) -> None:
    d = json.loads(path.read_text())
    for w in d["works"]:
        w.pop("w", None)
        w.pop("h", None)
        w["kt"] = pad([t for tag in w.get("tags", []) for t in tokens(tag)])
        w["kn"] = pad(tokens(w["title"]))
        w["ko"] = pad(tokens(" ".join([w.get("medium", ""), w.get("institution", ""), w.get("description", "")])))
    path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    print(f"{path.name}: {len(d['works'])} works indexed, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    names = sys.argv[1:] or [p.stem for p in CAT.glob("*.json") if p.stem != "artists"]
    for n in names:
        index_catalog(CAT / f"{n}.json")

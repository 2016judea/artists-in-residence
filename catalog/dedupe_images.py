#!/usr/bin/env python3
"""One record per work, by looking: collapse records whose images are the same sheet.

    python3 catalog/dedupe_images.py leonardo-da-vinci [isaac-newton ...]

Commons often holds one drawing several times: a museum scan, a Google Art Project scan, a
"(cropped)", a restored copy. Their titles differ ("Vitruvian Man", "Da Vinci Vitruve Luc
Viatour", "Uomo Vitruviano"), so build.py's title key can't see it. This fetches a 120 px
thumbnail of every Commons record and the issue sheets, takes a 64-bit difference hash, and
groups images within a small Hamming distance. Per group it keeps the hand-tagged issue sheet,
else the largest scan. Catalogue sources whose records are one object each (LOC, Met, AIC,
Wellcome) are left alone.

Needs Pillow and the network (sandbox off). Run before catalog/index.py.
"""
from __future__ import annotations

import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAT = ROOT / "worker" / "src" / "catalog"
UA = "artists-in-residence/0.1 (+https://github.com/2016judea/artists-in-residence; aidanjude2016@gmail.com)"
MAX_DIST = 6  # of 64 bits. At 10, three different text-heavy folios of the Codex on Flight merged (2026-11-20)


def small_url(w: dict) -> str | None:
    u = w["thumb_url"]
    if u.startswith("sheets/"):
        return None
    return re.sub(r"/\d+px-", "/120px-", u) if re.search(r"(upload|thumb)\.wikimedia\.org", u) else None


def dhash(img: Image.Image) -> int:
    g = img.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.get_flattened_data()) if hasattr(g, "get_flattened_data") else list(g.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (px[row * 9 + col] > px[row * 9 + col + 1])
    return bits


def hash_of(w: dict) -> int | None:
    try:
        if w["thumb_url"].startswith("sheets/"):
            slug = w["id"].split(":", 1)[1].split("/")[0]
            name = w["thumb_url"].split("/")[-1]
            local = ROOT / "worker" / "public" / "thumbs" / slug / name
            return dhash(Image.open(local))
        url = small_url(w)
        if not url:
            return None
        for attempt in range(4):
            try:
                time.sleep(0.8)  # upload.wikimedia.org answers 429 "too many requests" to 6 parallel fetches
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return dhash(Image.open(io.BytesIO(r.read())))
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    return None
                time.sleep(10 * (attempt + 1))
        return None
    except Exception:
        return None


def run(slug: str) -> None:
    path = CAT / f"{slug}.json"
    d = json.loads(path.read_text())
    works = d["works"]
    cand = [i for i, w in enumerate(works) if w["id"].startswith(("commons:", "sheet:"))]
    with ThreadPoolExecutor(1) as ex:
        hashes = dict(zip(cand, ex.map(lambda i: hash_of(works[i]), cand)))
    drop: set[int] = set()
    groups = 0
    items = [(i, h) for i, h in hashes.items() if h is not None]
    for a in range(len(items)):
        i, hi = items[a]
        if i in drop:
            continue
        group = [i] + [j for j, hj in items[a + 1:] if j not in drop and bin(hi ^ hj).count("1") <= MAX_DIST]
        if len(group) == 1:
            continue
        groups += 1
        best = max(group, key=lambda k: (bool(works[k].get("featured")), works[k].get("w", 0) * works[k].get("h", 0)))
        drop.update(k for k in group if k != best)
        if groups <= 6:
            print("   same sheet:", " | ".join(works[k]["title"][:40] for k in group), "-> keep", works[best]["title"][:40])
    d["works"] = [w for k, w in enumerate(works) if k not in drop]
    d["count"] = len(d["works"])
    path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    missing = sum(1 for h in hashes.values() if h is None)
    print(f"{slug}: {len(works)} -> {d['count']} works ({groups} groups merged; {missing} thumbnails unreadable, kept)")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        run(s)

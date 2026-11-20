#!/usr/bin/env python3
"""Stage what the Worker serves besides the catalogs. Run before every deploy (npm run deploy does).

  worker/public/sheets/<slug>/<file>.jpg   the curated issue sheets, <=1400 px (the "full-res" link)
  worker/public/thumbs/<slug>/<file>.jpg   the same at <=800 px (what a tool call returns as an image)
  worker/src/catalog/artists.json          name, issue, summary and modes per artist, from artists/*/artist.json

Leonardo's sheets are read from the leonardo skill folder (artist.json "source"), never copied
into this repo. Both public/ folders are generated and gitignored. Needs ImageMagick (`magick`).
"""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / "worker" / "public"


def main() -> None:
    artists = []
    for d in sorted(p for p in (ROOT / "artists").iterdir() if (p / "artist.json").exists()):
        cfg = json.loads((d / "artist.json").read_text())
        home = pathlib.Path(cfg["source"]).expanduser() if "source" in cfg else d
        featured = json.loads((d / "featured.json").read_text()) if (d / "featured.json").exists() else []
        wanted = {r["image_url"].split("/")[-1] for r in featured if r["image_url"].startswith("sheets/")}
        for kind, px in (("sheets", 1400), ("thumbs", 800)):
            out = PUB / kind / d.name
            shutil.rmtree(out, ignore_errors=True)
            out.mkdir(parents=True)
            for name in wanted:
                src = home / "sheets" / name
                subprocess.run(["magick", str(src), "-resize", f"{px}x{px}>", "-strip", "-quality", "85",
                                str(out / name)], check=True)
        modes = {}
        if "modes" in cfg:
            modes = {k: m.get("about", "") for k, m in cfg["modes"].items()}
        artists.append({
            "slug": d.name, "tool": d.name.replace("-", "_"), "name": cfg["name"],
            "served": cfg.get("served", []), "summary": cfg.get("public_summary", cfg.get("summary", "")),
            "years": cfg.get("years", ""), "kinds": modes, "examples": cfg.get("examples", []),
        })
        print(f"{d.name}: {len(wanted)} sheets staged")
    artists.sort(key=lambda a: a["years"][:4])  # by birth year: the order tools are listed in
    (ROOT / "worker" / "src" / "catalog" / "artists.json").write_text(json.dumps(artists, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

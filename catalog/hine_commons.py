#!/usr/bin/env python3
"""Give the Library of Congress Hine records an image a Worker can actually fetch.

    python3 catalog/hine_commons.py

WHY. tile.loc.gov, cdn.loc.gov and www.loc.gov all answer 403 to a Cloudflare Worker's
subrequest, whatever the User-Agent (probed from the deployed Worker, 2026-11-20), while
answering 200 to a desktop. Wikimedia Commons mirrors the National Child Labor Committee set
(about 8,000 files whose source is hdl.loc.gov/loc.pnp/nclc.NNNNN) and its thumbnails do load
from the Worker. So each LOC record whose NCLC number has a Commons copy gets that copy as its
`thumb_url` (the picture a tool call returns). Its credit, licence, source page and full-size
link stay the Library of Congress's; the credit says the picture came via Commons.

Run after build.py has written lewis-hine.json. Stdlib only; network (sandbox off).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build import COMMONS, get_json  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATH = ROOT / "worker" / "src" / "catalog" / "lewis-hine.json"


def commons_map() -> dict[str, str]:
    out: dict[str, str] = {}
    offset = 0
    while offset is not None and offset < 10000:  # CirrusSearch stops paging at 10,000
        data = get_json(COMMONS, {"action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 50,
                                  "gsroffset": offset, "gsrsearch": 'insource:"loc.pnp/nclc"',
                                  "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 960,
                                  "iiextmetadatafilter": "Credit|LicenseShortName|ImageDescription", "format": "json"})
        if not data:
            break
        for p in data.get("query", {}).get("pages", {}).values():
            ii = (p.get("imageinfo") or [{}])[0]
            m = ii.get("extmetadata", {})
            lic = m.get("LicenseShortName", {}).get("value", "").lower()
            if "public domain" not in lic and not lic.startswith("pd"):
                continue
            text = " ".join([p["title"], m.get("Credit", {}).get("value", ""), m.get("ImageDescription", {}).get("value", "")])
            for n in set(re.findall(r"nclc[./-]?(\d{5})", text, re.I)):
                if ii.get("thumburl"):
                    out.setdefault(n, ii["thumburl"])
        offset = (data.get("continue") or {}).get("gsroffset")
        time.sleep(0.5)
        if offset and offset % 1000 == 0:
            print(f"   commons offset {offset}: {len(out)} NCLC numbers mapped")
    return out


def main() -> None:
    m = commons_map()
    d = json.loads(PATH.read_text())
    hit = loc = 0
    for w in d["works"]:
        if not w["id"].startswith("loc:"):
            continue
        loc += 1
        n = re.search(r"/nclc/\d{5}/(\d{5})", w["image_url"])
        if n and n.group(1) in m:
            w["thumb_url"] = m[n.group(1)]
            if "image via Wikimedia Commons" not in w["credit"]:
                w["credit"] += " · image via Wikimedia Commons"
            hit += 1
    PATH.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    print(f"lewis-hine: {hit} of {loc} Library of Congress records now show a Commons copy of the same scan "
          f"({len(m)} NCLC numbers found on Commons)")


if __name__ == "__main__":
    main()

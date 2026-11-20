#!/usr/bin/env python3
"""Build the public-domain catalog the MCP Worker serves, one JSON file per artist.

    python3 catalog/build.py                 # every artist
    python3 catalog/build.py lewis-hine      # one artist

Sources (all fetched over the public internet, descriptive User-Agent, polite pacing):
  - Wikimedia Commons categories, walked to a small depth   (Leonardo, Newton, Cajal, Lissitzky)
  - Library of Congress, contributor "hine, lewis wickes"   (Hine)
  - Art Institute of Chicago API, is_public_domain only     (Lissitzky, Hine)
  - the issue sheets in artists/<slug>/sheets/, tagged by hand from looking (featured=true)

A record is kept ONLY if its source marks it public domain / CC0 / "no known restrictions".
El Lissitzky (d. 1941) is further limited to works dated 1930 or earlier (US public domain
covers works published before 1931); undated works of his are dropped.

Output: worker/src/catalog/<slug>.json  — committed, so a deploy is reproducible.
Stdlib only. Needs the network (run with the Bash sandbox off).
"""
from __future__ import annotations

import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "worker" / "src" / "catalog"
UA = "artists-in-residence/0.1 (+https://github.com/2016judea/artists-in-residence; aidanjude2016@gmail.com)"
COMMONS = "https://commons.wikimedia.org/w/api.php"

PD_LICENCES = {"public domain", "cc0", "pd", "pdm", "no restrictions", "pd-old", "pd-art", "pd-us"}

# Per artist: Commons roots (category, depth), subcategory names to skip (they drift into
# copies, memorials, popular culture), and the other sources to pull.
ARTISTS = {
    "leonardo-da-vinci": {
        "commons": [("Category:Drawings by Leonardo da Vinci", 3), ("Category:Codex Leicester", 1),
                    ("Category:Codex Atlanticus", 1), ("Category:Codex Arundel", 1)],
        "skip": r"by country|by decade|by museum|by title|in popular culture|copies|after leonardo|workshop|"
                r"replica|exhibition|statue|monument|coin|stamp|reconstruction|model|facsimile|forger",
        "max": 3000,
        "require_author": r"leonardo|vinci",
        # "Follower of Leonardo", "workshop of", "after Leonardo" all contain his name: refuse them.
        "reject_author": r"follower|workshop|atelier|after |circle|school|attributed|copy|copie|imitator|pupil|"
                         r"student|manner of|copyist|melzi|boltraffio|salai|salaì|cesare da sesto|giampietrino",
        "drop_after": 1525,   # Commons dates a book scan by the book (1898 etc.): not his date
        "year_min": 1460,     # a smaller "year" is a folio number read as a date (000V-1064)
        # Codex Atlanticus folios titled only by folio number: his pages, but nothing to search them by
        "skip_title": r"^File:(Codex Atlanticus - )?\d{3}[RV]-\d+\.",
    },
    "isaac-newton": {
        "commons": [("Category:Philosophiae Naturalis Principia Mathematica", 2),
                    ("Category:Writings of Isaac Newton", 2), ("Category:Newton's reflector", 0)],
        "commons_search": ["Newton Opticks 1704 plate", "Opticks Newton figure", "Principia 1687 figure Newton",
                           "Isaac Newton manuscript", "Newton prism experiment drawing",
                           "Principia comet 1680", "Newton Principia diagram", "Opticks Newton 1704"],
        "require_author": r"newton",
        "skip_title": r"voltaire|pemberton|maclaurin|account of sir|view of sir|memoirs|elements de la philosophie",
        "drop_after": 1760,
        "skip": r"text ornaments|1756|1759|1846|1872|french edition|german edition|english edition|"
                r"in art|memorial|monument|scarecrow|gargoyle|cradle|crater|stamp|coin",
        "max": 500,
    },
    "ramon-y-cajal": {
        "commons": [("Category:Scientific works by Santiago Ramón y Cajal", 2),
                    ("Category:Photographs taken by Santiago Ramón y Cajal", 1),
                    ("Category:Santiago Ramón y Cajal", 0)],
        "commons_search": ["Cajal drawing", "Ramón y Cajal", "Cajal neuron", "Cajal retina"],
        "skip": r"monument|memorial|crater|palacete|things named|libro en honor|stamp|coin|banknote",
        "max": 500,
        "require_author": r"cajal",
        "drop_after": 1935,
        "wellcome": ("Ramón y Cajal", r"cajal"),
    },
    "el-lissitzky": {
        "commons": [("Category:Works by El Lissitzky", 2), ("Category:El Lissitzky", 0)],
        "skip": r"allee|by museum|architectural works|memorial|exhibition view",
        "max": 400,
        "max_year": 1930,
        "require_author": r"lissitzky|lisitzky|lissitsky|лисицк",
        "aic": "Lissitzky",
    },
    "lewis-hine": {
        "loc": "hine, lewis wickes",
        "met": ("Lewis Hine", "hine"),
        "aic": "Lewis Hine",
        "max": 8000,
    },
}

STOP = set("""a an and the of in on at to for from by with as is are was were be this that these those it its
his her their our your no not or but into over under up down out off near all any some one two three
de del la le les el los las da di du des und der die das van von y e et ca circa about c recto verso
file jpg jpeg png tif tiff page plate fig figure lot photographer photograph print location see also
lewis hine leonardo vinci isaac newton santiago ramon cajal ramón lissitzky el w wickes edward investigator
""".split())


# ── http ───────────────────────────────────────────────────────────────────────────────────────
def get_json(url: str, params: dict | None = None, headers: dict | None = None, tries: int = 4):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # 429 / transient: back off
            if i == tries - 1:
                print(f"   ! {url[:120]}: {e}", file=sys.stderr)
                return None
            time.sleep(2 * (i + 1) ** 2)


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def year_of(*texts: str) -> int | None:
    for t in texts:
        m = re.search(r"\b(1[0-9]{3}|20[0-2][0-9])\b", t or "")
        if m:
            return int(m.group(1))
    return None


def words(text: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-zà-ÿ]+", (text or "").lower()):
        if len(w) > 2 and w not in STOP:
            out.append(w)
    return out


def tagset(*parts: str, extra: list[str] | None = None, limit: int = 40) -> list[str]:
    seen, out = set(), []
    for w in (extra or []) + [w for p in parts for w in words(p)]:
        w = w.strip().lower()
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return out[:limit]


# ── Wikimedia Commons ──────────────────────────────────────────────────────────────────────────
def commons_walk(root: str, depth: int, skip: re.Pattern, cap: int) -> list[str]:
    files, seen_cats, queue = [], set(), [(root, depth)]
    while queue and len(files) < cap * 2:
        cat, d = queue.pop(0)
        if cat in seen_cats:
            continue
        seen_cats.add(cat)
        cont = {}
        while True:
            data = get_json(COMMONS, {"action": "query", "list": "categorymembers", "cmtitle": cat,
                                      "cmtype": "file|subcat", "cmlimit": 500, "format": "json", **cont})
            if not data:
                break
            for m in data["query"]["categorymembers"]:
                t = m["title"]
                if t.startswith("Category:"):
                    if d > 0 and not skip.search(t.lower()):
                        queue.append((t, d - 1))
                elif re.search(r"\.(jpe?g|png|tiff?|gif|webp)$", t, re.I):
                    files.append(t)
            if "continue" not in data:
                break
            cont = data["continue"]
            time.sleep(0.3)
    return list(dict.fromkeys(files))


def commons_search(q: str, limit: int = 400) -> list[str]:
    data = get_json(COMMONS, {"action": "query", "list": "search", "srsearch": q, "srnamespace": 6,
                              "srlimit": limit, "format": "json"})
    return [r["title"] for r in (data or {}).get("query", {}).get("search", [])
            if re.search(r"\.(jpe?g|png|tiff?|gif|webp)$", r["title"], re.I)]


INSTITUTION_PAT = re.compile(r"\b(?:in|at) (?:the )?((?:Royal Collection|Biblioteca|British|Metropolitan|National|"
                             r"Gallerie|Galleria|Uffizi|Louvre|Museo|Musée|Museum|Library|Bibliothèque|Kunsthalle|"
                             r"Staatliche|Tretyakov|Getty|Philadelphia|Van Abbemuseum|Instituto|Wellcome|"
                             r"Ambrosiana|Accademia|Windsor|Teylers|Castello|Morgan)[^,;]*)", re.I)


def commons_records(titles: list[str], artist: str, cfg: dict) -> list[dict]:
    recs = []
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        data = get_json(COMMONS, {"action": "query", "titles": "|".join(batch), "prop": "imageinfo|categories",
                                  "iiprop": "url|size|extmetadata", "iiurlwidth": 960, "clshow": "!hidden",
                                  "cllimit": 500, "format": "json"})
        time.sleep(0.4)
        if not data:
            continue
        for p in data["query"]["pages"].values():
            ii = (p.get("imageinfo") or [{}])[0]
            m = ii.get("extmetadata", {})
            lic = strip_html(m.get("LicenseShortName", {}).get("value", "")).lower()
            if not (lic in PD_LICENCES or lic.startswith("public domain") or lic.startswith("cc0")
                    or lic.startswith("pd")):
                continue
            if not ii.get("thumburl") or ii.get("width", 0) < 400:
                continue
            author = strip_html(m.get("Artist", {}).get("value", ""))
            # The author field, not the title: a title "An account of Sir Isaac Newton's discoveries"
            # is a book ABOUT him, and a portrait of Cajal is the painter's work, not his.
            if cfg.get("require_author") and not re.search(cfg["require_author"], author, re.I):
                continue
            if cfg.get("reject_author") and re.search(cfg["reject_author"], author + " " + p["title"], re.I):
                continue
            if re.search(r"signature|firma|autograph|grave|tomb|statue|monument|memorial|stamp|banknote",
                         p["title"], re.I):
                continue
            if cfg.get("skip_title") and re.search(cfg["skip_title"], p["title"], re.I):
                continue
            cats = [c["title"].removeprefix("Category:") for c in p.get("categories", [])]
            title = strip_html(m.get("ObjectName", {}).get("value", "")) or \
                re.sub(r"\.\w+$", "", p["title"].removeprefix("File:")).replace("_", " ")
            desc = strip_html(m.get("ImageDescription", {}).get("value", ""))[:400]
            date = strip_html(m.get("DateTimeOriginal", {}).get("value", ""))
            date = re.sub(r"\s*date QS:.*$", "", date).strip(" ,;")[:60]
            yr = year_of(date, title)
            if cfg.get("year_min") and yr and yr < cfg["year_min"]:
                yr = None
            if cfg.get("max_year") and (yr is None or yr > cfg["max_year"]):
                continue
            if cfg.get("drop_after") and yr and yr > cfg["drop_after"]:
                continue
            title = re.sub(r"\s*label QS:.*$", "", title).strip(" ,;")
            inst = ""
            for c in cats:
                mm = INSTITUTION_PAT.search(c)
                if mm:
                    inst = mm.group(1).strip()
                    break
            medium = next((c for c in cats if re.search(r"chalk|ink|silverpoint|metalpoint|engraving|woodcut|"
                                                        r"lithograph|gouache|oil on|watercolou?r|photograph|"
                                                        r"gelatin|collage|pencil|charcoal", c, re.I)), "")
            recs.append({
                "id": "commons:" + p["title"].removeprefix("File:"),
                "w": ii.get("width", 0),
                "h": ii.get("height", 0),
                "title": title[:200],
                "date": date,
                "year": yr,
                "medium": medium,
                "institution": inst,
                "licence": "Public domain" if not lic.startswith("cc0") else "CC0",
                "credit": f"{author or artist} · via Wikimedia Commons" + (f" · {inst}" if inst else ""),
                "source_url": ii.get("descriptionurl", ""),
                "image_url": ii.get("url", ""),
                "thumb_url": ii.get("thumburl", ""),
                "tags": tagset(title, desc, *cats),
                "description": desc,
            })
    return recs


# ── Library of Congress ────────────────────────────────────────────────────────────────────────
def loc_records(contributor: str, cap: int) -> list[dict]:
    """One shallow query per year. loc.gov's deep pages are slow: on 2026-11-20 page 36 of the
    whole set took 57 s and returned a truncated body, while a single year (1908: 474 records,
    5 pages) answered in 2 s a page. Splitting by `dates=` keeps every query near the front."""
    recs, seen = [], set()
    for year in range(1904, 1941):
        page = 1
        while len(recs) < cap:
            data = get_json("https://www.loc.gov/photos/", {"q": "lewis hine", "fa": f"contributor:{contributor}",
                                                            "fo": "json", "c": 100, "sp": page,
                                                            "dates": f"{year}/{year}"})
            got = _loc_page(data, recs, seen)
            if not got or not (data.get("pagination") or {}).get("next"):
                break
            page += 1
            time.sleep(1.0)
        print(f"   loc {year}: {len(recs)} kept so far")
        time.sleep(1.0)
    return recs


def _loc_page(data, recs: list[dict], seen: set) -> int:
        if not data or not data.get("results"):
            return 0
        for r in data["results"]:
            it = r.get("item") or {}
            if "/item/" not in r.get("id", "") or not r.get("image_url"):
                continue
            rights = it.get("rights_advisory") or ""
            if isinstance(rights, list):
                rights = " ".join(rights)
            if not rights.lower().startswith("no known restrictions"):
                continue
            urls = [u.split("#")[0] for u in r["image_url"]]
            jpgs = [u for u in urls if u.endswith(".jpg")]
            thumb = next((u for u in jpgs if u.endswith("r.jpg")), jpgs[-1] if jpgs else urls[-1])
            full = next((u for u in jpgs if u.endswith("v.jpg")), jpgs[-1] if jpgs else urls[-1])
            title = re.sub(r"\s+", " ", r.get("title", "")).strip()
            date = (it.get("created_published") or r.get("date") or "")
            date = date if isinstance(date, str) else " ".join(date)
            subj = r.get("subject") or []
            rid = "loc:" + r["id"].rstrip("/").split("/")[-1]
            if rid in seen:
                continue
            seen.add(rid)
            recs.append({
                "id": rid,
                "title": title[:300],
                "date": date[:40],
                "year": year_of(date, r.get("date", "")),
                "medium": (it.get("medium") or [""])[0] if isinstance(it.get("medium"), list) else (it.get("medium") or ""),
                "institution": "Library of Congress, Prints and Photographs Division",
                "licence": "No known restrictions on publication",
                "credit": "Lewis Hine · " + next((n.removeprefix("Credit line: ").rstrip(".") for n in it.get("notes") or []
                                                   if n.startswith("Credit line:")), "Library of Congress"),
                "source_url": r.get("url") or r["id"],
                "image_url": full,
                "thumb_url": thumb,
                "tags": tagset(title, extra=[s for s in subj if s not in ("photographic prints", "united states")]),
                "description": "",
            })
        return len(data["results"])


# ── The Metropolitan Museum of Art ────────────────────────────────────────────────────────────
def met_records(query: str, artist: str) -> list[dict]:
    """/public/collection/v1/search was retired 2026-10-01; v1.1 search works. Objects still at v1."""
    data = get_json("https://collectionapi.metmuseum.org/public/collection/v1.1/search", {"q": query})
    recs = []
    for oid in (data or {}).get("objectIDs") or []:
        o = get_json(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}")
        time.sleep(0.1)
        if not o or not o.get("isPublicDomain") or not o.get("primaryImage"):
            continue
        if artist.lower() not in (o.get("artistDisplayName") or "").lower():
            continue
        recs.append({
            "id": f"met:{oid}",
            "title": (o.get("title") or "")[:200],
            "date": o.get("objectDate") or "",
            "year": o.get("objectEndDate") or year_of(o.get("objectDate", "")),
            "medium": o.get("medium") or "",
            "institution": "The Metropolitan Museum of Art",
            "licence": "Public domain (CC0, Met Open Access)",
            "credit": f"{o.get('artistDisplayName')} · The Metropolitan Museum of Art" +
                      (f" · {o['creditLine']}" if o.get("creditLine") else ""),
            "source_url": o.get("objectURL") or f"https://www.metmuseum.org/art/collection/search/{oid}",
            "image_url": o["primaryImage"],
            "thumb_url": o.get("primaryImageSmall") or o["primaryImage"],
            "tags": tagset(o.get("title", ""), o.get("medium", ""),
                           extra=[t["term"].lower() for t in (o.get("tags") or []) if t.get("term")]),
            "description": "",
        })
    return recs


# ── Art Institute of Chicago ───────────────────────────────────────────────────────────────────
def aic_records(name: str, max_year: int | None) -> list[dict]:
    recs, page = [], 1
    fields = "id,title,artist_title,date_display,date_end,is_public_domain,image_id,medium_display,credit_line,subject_titles,classification_titles"
    while page <= 10:
        data = get_json("https://api.artic.edu/api/v1/artworks/search",
                        {"q": name, "limit": 100, "page": page, "fields": fields},
                        headers={"AIC-User-Agent": UA})
        if not data or not data.get("data"):
            break
        for a in data["data"]:
            if name.split()[-1].lower() not in (a.get("artist_title") or "").lower():
                continue
            if not a.get("is_public_domain") or not a.get("image_id"):
                continue
            yr = a.get("date_end")
            if max_year and (yr is None or yr > max_year):
                continue
            iiif = f"https://www.artic.edu/iiif/2/{a['image_id']}"
            recs.append({
                "id": f"aic:{a['id']}",
                "title": a.get("title", "")[:200],
                "date": a.get("date_display") or "",
                "year": yr,
                "medium": a.get("medium_display") or "",
                "institution": "Art Institute of Chicago",
                "licence": "Public domain (CC0)",
                "credit": f"{a.get('artist_title')} · Art Institute of Chicago" +
                          (f" · {a['credit_line']}" if a.get("credit_line") else ""),
                "source_url": f"https://www.artic.edu/artworks/{a['id']}",
                "image_url": f"{iiif}/full/1686,/0/default.jpg",
                "thumb_url": f"{iiif}/full/843,/0/default.jpg",
                "tags": tagset(a.get("title", ""), a.get("medium_display", ""),
                               extra=(a.get("subject_titles") or []) + (a.get("classification_titles") or [])),
                "description": "",
            })
        if page >= data.get("pagination", {}).get("total_pages", 1):
            break
        page += 1
        time.sleep(0.5)
    return recs


# ── Wellcome Collection (whole books, Public Domain Mark) ──────────────────────────────────────
def wellcome_records(query: str, author: str) -> list[dict]:
    data = get_json("https://api.wellcomecollection.org/catalogue/v2/works",
                    {"query": query, "items.locations.license": "pdm,cc-0", "pageSize": 100,
                     "include": "production,contributors,subjects"})
    recs = []
    for w in (data or {}).get("results", []):
        names = " ".join(c["agent"]["label"] for c in w.get("contributors", []))
        thumb = (w.get("thumbnail") or {}).get("url", "")
        if not re.search(author, names, re.I) or not thumb:
            continue
        date = next((d.get("label", "") for p in w.get("production", []) for d in p.get("dates", [])), "")
        recs.append({
            "id": f"wellcome:{w['id']}",
            "title": w["title"][:200],
            "date": date,
            "year": year_of(date),
            "medium": "printed book with figures (digitised)",
            "institution": "Wellcome Collection",
            "licence": "Public Domain Mark",
            "credit": "Santiago Ramón y Cajal · Wellcome Collection",
            "source_url": f"https://wellcomecollection.org/works/{w['id']}",
            "image_url": thumb.replace("!200,200", "!1024,1024"),
            "thumb_url": thumb.replace("!200,200", "!800,800"),
            "tags": tagset(w["title"], extra=[s["label"].lower() for s in w.get("subjects", [])][:10]),
            "description": "",
        })
    return recs


# ── the issue sheets, tagged by hand ───────────────────────────────────────────────────────────
def featured_records(slug: str) -> list[dict]:
    f = ROOT / "artists" / slug / "featured.json"
    if not f.exists():
        return []
    out = []
    for r in json.loads(f.read_text()):
        r = {**r, "featured": True}
        r.setdefault("description", "")
        out.append(r)
    return out


def work_key(r: dict) -> str:
    """Several Commons files are often one sheet (a museum scan, a Google Art Project scan, a crop).
    Key a work by its Royal Collection number (+recto/verso) when it has one, else by its title
    with the artist's name, scan-source tags and file cruft removed, plus its year."""
    if not (r["id"].startswith("commons:") or r["id"].startswith("sheet:")):
        return r["id"]  # catalogue records (LOC, Met, AIC, Wellcome) are one work each; captions repeat
    t = r["title"] + " " + r["id"]
    m = re.search(r"RCIN\s*(\d{6})", t, re.I) or re.search(r"\b(91\d{4})\b", t)
    side = "v" if re.search(r"\bverso\b|\d{6}v\b", t, re.I) else "r"
    if m:
        return f"rcin:{m.group(1)}{side}"
    n = r["title"].lower()
    n = re.sub(r"leonardo da vinci|da vinci|leonardo|google art project|wga\d+|\(\d{4,}\)|\.(jpe?g|png|tiff?)$|"
               r"\b(c\.|ca\.|circa)\b|\b1[45]\d\d\b|cropped|crop|detail|restored|retouched|high resolution|hd",
               " ", n)
    n = re.sub(r"[^a-z0-9à-ÿ]+", " ", n).strip()
    return f"t:{n}|{r.get('year')}|{side}" if n else r["id"]


def dedupe(recs: list[dict]) -> list[dict]:
    seen_url, by_key, order = set(), {}, []
    for r in recs:
        url = r["source_url"].split("?")[0].lower()
        if url in seen_url:
            continue
        seen_url.add(url)
        k = work_key(r)
        cur = by_key.get(k)
        if cur is None:
            by_key[k] = r
            order.append(k)
        elif not cur.get("featured") and (r.get("featured") or r.get("w", 0) * r.get("h", 0) > cur.get("w", 0) * cur.get("h", 0)):
            by_key[k] = r  # keep the hand-tagged sheet, else the largest scan
    return [by_key[k] for k in order]


def build(slug: str) -> None:
    cfg = ARTISTS[slug]
    recs = featured_records(slug)
    if "commons" in cfg:
        skip = re.compile(cfg.get("skip", r"$^"), re.I)
        titles = []
        for root, depth in cfg["commons"]:
            got = commons_walk(root, depth, skip, cfg["max"])
            print(f"   {root}: {len(got)} files")
            titles += got
        for q in cfg.get("commons_search", []):
            got = commons_search(q)
            print(f"   search '{q}': {len(got)} files")
            titles += got
        titles = list(dict.fromkeys(titles))[: cfg["max"] * 2]
        recs += commons_records(titles, slug, cfg)
    if "wellcome" in cfg:
        got = wellcome_records(*cfg["wellcome"])
        print(f"   Wellcome: {len(got)} public-domain works")
        recs += got
    if "loc" in cfg:
        recs += loc_records(cfg["loc"], cfg["max"])
    if "met" in cfg:
        got = met_records(*cfg["met"])
        print(f"   Met: {len(got)} public-domain works")
        recs += got
    if "aic" in cfg:
        got = aic_records(cfg["aic"], cfg.get("max_year"))
        print(f"   AIC: {len(got)} public-domain works")
        recs += got
    before = len(recs)
    recs = dedupe(recs)[: cfg["max"]]
    print(f"   {before} records -> {len(recs)} works after one-record-per-work dedupe")
    counts: dict[str, int] = {}
    for r in recs:
        counts[r["title"]] = counts.get(r["title"], 0) + 1
    for r in recs:
        if counts[r["title"]] > 1 and r["id"].startswith("commons:"):
            stem = re.sub(r"\.\w+$", "", r["id"].removeprefix("commons:")).replace("_", " ")
            if stem.lower() != r["title"].lower():
                r["title"] = f"{r['title'][:140]} [{stem[-60:]}]"
    OUT.mkdir(parents=True, exist_ok=True)
    meta = json.loads((ROOT / "artists" / slug / "artist.json").read_text())
    (OUT / f"{slug}.json").write_text(json.dumps({
        "slug": slug, "name": meta["name"], "built": time.strftime("%Y-%m-%d"),
        "count": len(recs), "works": recs}, ensure_ascii=False, separators=(",", ":")))
    print(f"{slug}: {len(recs)} works -> {OUT / (slug + '.json')}")
    sys.path.insert(0, str(ROOT / "catalog"))
    import index  # precomputed search tokens; see catalog/index.py
    index.index_catalog(OUT / f"{slug}.json")


if __name__ == "__main__":
    for s in (sys.argv[1:] or list(ARTISTS)):
        print(f"== {s}")
        build(s)

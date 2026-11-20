# Artists in Residence

**Live:** https://artists-in-residence.small-business-intelligence-mcp.workers.dev/mcp

A free remote MCP server that puts real public-domain works by five artists inside Claude. Ask for a subject
("Leonardo's flying machines", "Hine's newsboys", "Cajal's retina") and get the matching works: the first as an
image, every one with its title, date, medium, holding institution, credit line, licence, source page and
full-resolution link. Nothing is generated. No account, no key.

**Add it to Claude:** Settings → Connectors → Add custom connector → paste the URL above.

| Artist | Dates | Works | From |
|---|---|---|---|
| Leonardo da Vinci | 1452–1519 | 625 | Wikimedia Commons scans (Royal Collection, Ambrosiana, British Museum, Uffizi, Louvre, Met…) |
| Isaac Newton | 1643–1727 | 205 | Wikimedia Commons (the Principia editions he oversaw, Opticks, manuscripts) |
| Santiago Ramón y Cajal | 1852–1934 | 44 | Wikimedia Commons, Wellcome Collection, Internet Archive |
| Lewis Hine | 1874–1940 | 6,943 | Library of Congress (National Child Labor Committee, "no known restrictions"), Art Institute of Chicago |
| El Lissitzky | 1890–1941 | 190 (1930 and earlier) | Wikimedia Commons |

Counts as of the last catalog build (2026-11-20); `list_artists` prints the live ones.

Independent; not affiliated with the Library of Congress, the Art Institute of Chicago, the Wellcome Collection,
Wikimedia Commons, the Internet Archive or any museum or library.

## How it works

- **The catalog is built ahead of time**, not searched live: `catalog/build.py` crawls the open sources into one JSON
  file per artist under `worker/src/catalog/`, which ships inside the Worker. A weak or slow museum search can't
  break a tool call. Refresh: `python3 catalog/build.py [artist-slug]`, then `catalog/hine_commons.py` (Hine) and
  `catalog/dedupe_images.py <slugs>` (Commons artists), then `catalog/index.py` (network; Pillow for the hashes).
- **Public domain only.** A work is kept only if its source marks it public domain, CC0, Public Domain Mark or "no
  known restrictions". El Lissitzky (d. 1941) is limited to works dated 1930 or earlier (US public domain covers
  works published before 1931); undated works of his are dropped. Each artist's author field must name the artist,
  so books *about* Newton and portraits *of* Cajal stay out.
- **One record per work.** Commons often holds one sheet several times (a museum scan, a Google Art Project scan, a
  crop). `build.py` keys works by Royal Collection number or cleaned title; `catalog/dedupe_images.py` then compares
  64-bit image hashes and keeps one per sheet. Leonardo's Codex Atlanticus folios that Commons titles only by folio
  number ("000V-492") are left out: they are his, but nothing in them can be searched.
- **Hine's pictures.** The Library of Congress refuses image requests from Cloudflare Workers (403 on every host),
  so `catalog/hine_commons.py` points each NCLC record at Wikimedia Commons' copy of the same LOC scan where one
  exists (3,762 of 6,813). Credit, licence and links stay the Library of Congress's. The Met's Hine prints are not
  marked public domain by the Met, so none are included.
- **Highlights** are the works Aidan's magazines used (Aetas Nova Nos. 1–3, Credo Nos. 1–2), tagged by hand in
  `artists/<slug>/featured.json` and served from the Worker's own static assets.
- **Search** (`worker/src/search.ts`) scores tags, then title, then medium/institution/description, plus a year
  match. No match falls back to the closest works by tag, then to the highlights: never an empty list.
- **No model anywhere in the request path** (`~/.claude/CLAUDE.md`, "No MCP calls a model on our side"). The user's
  own Claude does the reasoning.

## Cost: $0, and a hard stop to keep it there

Cloudflare account: **Workers Free** (no paid subscription on the account, checked via the API 2026-11-20). Past
the free limits, Free plan requests error rather than bill. On top of that the server counts every tool call in
D1 and refuses past `DAILY_CALL_CAP` (20,000/day, against Workers Free's 100,000 requests and D1's 100,000 row
writes), answering "Today's free allowance … resets at 00:00 UTC". Static images are served by the asset layer,
which is free and uncounted. The counter fails closed: if D1 is unreachable, calls are refused rather than
uncounted.

## Expected use (written before launch, BUSINESS.md rule 2)

**Expected: 60 tool calls from people other than us in the 30 days to 2026-12-20 (about 2 a day).** There is no
base rate on record for an art connector; this is the number written down so the read on **2026-12-20** means
something. The directory filing is the main channel. Read it with:

```bash
cd worker && npx wrangler d1 execute artists-in-residence-usage --remote \
  --command "SELECT tool, SUM(n) AS calls FROM calls WHERE day >= '2026-11-21' GROUP BY tool ORDER BY calls DESC"
```

Our own test calls on 2026-11-20 are excluded by the date filter.

## Develop and deploy

```bash
cd worker
npm install
npm test                      # offline: catalogs are PD-only, every record complete, search cases
npm run deploy                # stages sheets/thumbs (catalog/assets.py, needs ImageMagick) then wrangler deploy
npm run live                  # the directory test cases against the live endpoint, through the MCP client
```

Cloudflare credentials: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the environment (the same account as
`small-business-intelligence-mcp`; its gitignored `.env` holds them).

Adding an artist in residence: a folder `artists/<slug>/` with `artist.json` (name, years, public_summary,
examples), `featured.json` (the issue's works, hand-tagged) and `sheets/`; a source entry in `catalog/build.py`'s
`ARTISTS`; one import line in `worker/src/server.ts`. Then build, test, deploy.

## The artist folders

`artists/<slug>/` holds each artist's hand-tagged highlights (`featured.json`, the works Aidan's magazines used),
their sheets, a measured note on their visual language (`STYLE.md`) and prompt files from an earlier generator that
was dropped on 2026-11-20 before it made a single paid call. This server only retrieves real works.

## Licence

Code: MIT. The works are public domain; credit lines and source links travel with every result.

# Data model

Written 2026-11-20 from the need (a stranger asks Claude for an artist's work on a subject and gets the real work,
credited and licensed), then checked against what the open sources actually carry.

## Entities

**Artist** (`artists/<slug>/artist.json`) — one per artist in residence.
| field | answers |
|---|---|
| name, years | who, and when they worked |
| public_summary | what kinds of work the catalog holds for them |
| examples | what a person can usefully ask for |

**Work** (`worker/src/catalog/<slug>.json` → `works[]`) — one real work, as its holder published it.
| field | answers |
|---|---|
| title, date, year | what it is and when it was made (year drives date filters and year queries) |
| medium | what it was made with |
| institution | who holds it |
| licence | may it be shown and reused (only PD / CC0 / PDM / "no known restrictions" are admitted) |
| credit | the line to print beside it |
| source_url | where to verify it |
| image_url, thumb_url | the full-resolution file, and the size a tool call returns as an image |
| tags | what is in it, in words a person would search |
| featured | used by Aidan's magazines (hand-tagged highlights) |

**Call** (D1 `calls`) — `day, tool, n`: how many tool calls a day, per tool. Answers "is anyone using it" and
enforces the daily cap. Holds no query text and nothing about the caller.

## Reality check (field by field)

| field | filled? |
|---|---|
| title, licence, credit, source_url, image_url, thumb_url | every record, every source (enforced by `npm test`) |
| date / year | almost all; Commons gives a free-text date, parsed for the first 4-digit year. Lissitzky records without one are dropped |
| tags | every record; hand-written for the highlights, derived from title + Commons categories / LOC subject headings / AIC subjects elsewhere. Not written by looking at each of thousands of works |
| institution | LOC, Wellcome, AIC and the highlights: always. Commons: only where a category names the holder (about a fifth of Leonardo's records) |
| medium | patchy on Commons (taken from medium categories when present) |

Shortfall, stated rather than hidden: institution and medium are thin on Commons-sourced records, and tags outside
the highlights come from catalogue text, not from looking. Neither blocks the core question (find the work, show it,
credit it, link it), so the build goes ahead on the full model rather than a reduced one.

## One record per work (added after the first build)

The Commons crawl returned many files per sheet and pages that aren't searchable. After the author filter
(followers, workshop and "after Leonardo" rejected), Leonardo went 3,007 records → 2,903 (title key) → 668 (Codex
Atlanticus folios titled only by folio number dropped) → 625 (image-hash merge of 29 same-sheet groups).
Lissitzky 216 → 190, Newton 214 → 205 by the same image merge. Known cost: at a looser threshold three different
Codex on Flight folios were merged before the threshold was tightened, so those three pages are missing until the
next full rebuild; a few Principia text pages may be merged as one.

Hine's `thumb_url` points at Wikimedia Commons' copy of the same LOC scan for 3,762 of 6,813 Library of Congress
records, because loc.gov refuses image requests from Cloudflare Workers. The rest show text and links only; ranking
breaks ties toward works whose picture loads.

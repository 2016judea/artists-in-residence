# Connector listing kit: Artists in Residence

Copy from here. Format follows `~/Desktop/workspace/vogue-paris-mcp/SUBMISSION.md` (its "For the next filing" traps
apply); browser mechanics: the `browser-as-aidan` skill ("His screen is locked").

| Field | Value |
|---|---|
| Name | Artists in Residence (20 chars) |
| Endpoint | `https://artists-in-residence.small-business-intelligence-mcp.workers.dev/mcp` · Streamable HTTP · stateless · auth none · no UI |
| Publisher | Brick and Mortar AI LLC, 1651 Eleanor Ave, Saint Paul, MN 55116 |
| Website / docs | https://artists-in-residence.small-business-intelligence-mcp.workers.dev/ |
| Privacy | https://artists-in-residence.small-business-intelligence-mcp.workers.dev/privacy |
| Support | https://github.com/2016judea/artists-in-residence/issues (issues enabled) |
| Source | https://github.com/2016judea/artists-in-residence |
| Icon 512×512 | https://artists-in-residence.small-business-intelligence-mcp.workers.dev/icon.png (original mark: ink frame, red disc, diagonal; no museum work) |
| Availability | All regions the directory offers |

**Name and independence.** The listing name is ours and generic. The artists' names stay in the tool names
(they are long-dead public-domain artists; the works are theirs). The landing page, privacy page, README, server
`instructions` and `list_artists` all carry: **"Independent; not affiliated with the Library of Congress, the Art
Institute of Chicago, Wikimedia Commons, the Internet Archive or any museum or library."**

**The domain is a `workers.dev` alias** under the account's existing subdomain (`small-business-intelligence-mcp`),
not one the LLC owns. Same caveat as Breach to Claim and Paris Fashion Archive.

## One-liner (≤100)
Real public-domain works by Leonardo, Newton, Cajal, Lissitzky and Hine, with credit and licence

## Description
Artists in Residence brings real public-domain works by five artists into Claude: Leonardo da Vinci's drawings and
notebooks, Isaac Newton's Principia and manuscripts, Santiago Ramón y Cajal's drawings of the nervous system, El
Lissitzky's Prouns, figurines and posters (1930 and earlier), and Lewis Hine's documentary photographs. Ask for a
subject and get the matching works: the first as an image, every one with title, date, medium, holding institution,
credit line, licence, source page and full-resolution link. The catalog is built from Wikimedia Commons, the Library
of Congress, the Art Institute of Chicago, the Wellcome Collection and the Internet Archive, and admits a work only if its source marks it public
domain, CC0 or "no known restrictions". Nothing is generated. No account, nothing stored about you. Independent; not
affiliated with any museum or library.

## Connection requirements
None. No account, key or OAuth. Six read-only tools.

## Annotations (explicit booleans; `scripts/live_cases.mjs` checks them on the live server)
| Tool | readOnly | destructive | openWorld | idempotent |
|---|---|---|---|---|
| list_artists, leonardo_da_vinci, isaac_newton, ramon_y_cajal, el_lissitzky, lewis_hine | true | false | false | true |

openWorld is false: the catalog ships inside the server; the only outbound call is a GET for the first match's
thumbnail from the holder's image host.

## The licence line (reviewers will ask)
Every work carries the licence its source gives it, and only public domain / CC0 / Public Domain Mark / "no known
restrictions on publication" (the Library of Congress's statement for the National Child Labor Committee photographs)
are admitted. El Lissitzky died in 1941: only works dated 1930 or earlier are included (US public domain covers works
published before 1931), and undated works of his are dropped. The credit line and source link travel with every
result.

## Test setup / reviewer access
No test account, no credentials.

```
curl -s https://artists-in-residence.small-business-intelligence-mcp.workers.dev/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lewis_hine","arguments":{"subject":"newsboys","limit":3}}}'
cd worker && npm run live     # every case below, against the live endpoint, through the official MCP client
```

## Test cases
Run against the live endpoint on 2026-11-20 with `npm run live` (official MCP client, Streamable HTTP): **13/13 PASS**. tools/list returns 6 tools, all with title and readOnly/non-destructive annotations.

| Call | Live result |
|---|---|
| `leonardo_da_vinci` `{subject:"flying machine"}` | 10 of 625 public-domain works by Leonardo da Vinci match "flying machine". Top 3: First: *Design for a flying machine (c. 1488)*; image 284 KB (277 ms) |
| `leonardo_da_vinci` `{subject:"horses"}` | 58 of 625 public-domain works by Leonardo da Vinci match "horses". Top 3: First: *Studies of horses and horses' heads (c. 1490)*; image 254 KB (267 ms) |
| `isaac_newton` `{subject:"principia title page"}` | 56 of 205 public-domain works by Sir Isaac Newton match "principia title page". Top 3: First: *Newton-Principia-Mathematica 1-500x700 (1687)*; image 58 KB (279 ms) |
| `isaac_newton` `{subject:"comet orbit"}` | 1 of 205 public-domain works by Sir Isaac Newton match "comet orbit". Top 1: First: *096-newt1687-figp434 (1687-01-01)*; image 140 KB (343 ms) |
| `ramon_y_cajal` `{subject:"retina"}` | 1 of 44 public-domain works by Santiago Ramón y Cajal match "retina". Top 1: First: *Fig retine (1911)*; image 37 KB (334 ms) |
| `ramon_y_cajal` `{subject:"purkinje cells"}` | 9 of 44 public-domain works by Santiago Ramón y Cajal match "purkinje cells". Top 3: First: *Santiago Ramon y Cajal nerve cells in the brain (circa 1900)*; image 267 KB (369 ms) |
| `el_lissitzky` `{subject:"proun"}` | 27 of 190 public-domain works by El Lissitzky match "proun". Top 3: First: *Proun 2 (Construction) (1920)*; image 312 KB (285 ms) |
| `el_lissitzky` `{subject:"poster"}` | 7 of 190 public-domain works by El Lissitzky match "poster". Top 3: First: *Beat the Whites with the Red Wedge (1919–20)*; image 348 KB (256 ms) |
| `lewis_hine` `{subject:"empire state building"}` | 866 of 6943 public-domain works by Lewis Hine match "empire state building". Top 3: First: *Icarus, Empire State Building (1930)*; image 219 KB (230 ms) |
| `lewis_hine` `{subject:"newsboys"}` | 164 of 6943 public-domain works by Lewis Hine match "newsboys". Top 3: First: *Group of Newsboys on Frankfort Street near World Building. Witness, Fr*; image 138 KB (403 ms) |
| `lewis_hine` `{subject:"zzqx qqvv"}` | No work by Lewis Hine matches "zzqx qqvv". Highlights instead (3): First: *Icarus, Empire State Building (1930)*; image 219 KB (201 ms) |

Negative: `lewis_hine {subject:"zzqx qqvv"}` matches nothing and returns highlights instead, never an empty list. No tool writes, sends, downloads or generates anything.

## Starter prompts
- Show me Leonardo's drawings of flying machines.
- Find Lewis Hine's photographs of newsboys.
- What did Cajal's drawings of the retina look like?

## Use cases (form step 4)
1. Find an artist's work on a subject. "Show me Leonardo da Vinci's studies of horses."
2. Get a credited public-domain image for a project. "Find a Lewis Hine photograph of the Empire State Building going up, with its credit line."
3. Explore what exists. "Which artists are in Artists in Residence, and what can I search for?"

Prerequisites: none. Read only.

## Reviewer note (form step 9)
Every result is a real work by the named artist, admitted only if its source marks it public domain, CC0 or "no known
restrictions"; the credit line, licence and source link come with each one. Nothing is generated and no model runs on
our side. The catalog is built ahead of time from Wikimedia Commons, the Library of Congress, the Wellcome Collection
and the Internet Archive. No account and nothing stored about the person: a per-day count of tool calls only (privacy
page). Independent; not affiliated with any museum or library.

## Submitted 2026-11-20

Filed by Claude in Aidan's own Chrome (JavaScript run by process id into a background tab; `browser-as-aidan`).
No other session's form was open at the time. Nothing was paid and nothing was sent to a person.

| Where | Status | UTC | Listing |
|---|---|---|---|
| Claude Connectors Directory | **PUBLISHED** (approved about two minutes after filing; Publish pressed) | 18:15 filed, 18:16 published | claude.ai/directory/manage/artists-in-residence · slug `artists-in-residence` (permanent) |

**What was filed.** Custom connector "Artists in Residence" added to his Claude (6 tools, 0 resources, auth none
detected). Name, one-liner and description verbatim from this kit. Categories: Education, Creative, Media &
Entertainment. Author Brick and Mortar AI LLC (https://brickandmortar.dev). Docs `/`, support the GitHub issues URL,
privacy `/privacy`, custom icon `/icon.png` (loaded at 512). Use cases as above. Prerequisites: none. Read only.
Company Brick and Mortar AI LLC, Aidan Jude, Founder. Auth none. Data handling "We own the API", no health data, no
sponsored content. Self-tested: every tool run through `@modelcontextprotocol/inspector@0.17.2 --cli` against the
live endpoint before ticking the box. All seven compliance boxes ticked (true now that nothing generates images);
the additional note is the reviewer note above plus one line on the thumbnail fetch.

**Form traps this time:** a hidden mobile step selector (`…-hidden-input`, value `useCases`) is the first text
input on step 4, so fill by element id, not by index.

**Official MCP Registry (2026-11-22):** `io.github.2016judea/artists-in-residence` 1.0.0, remote `https://artists-in-residence.small-business-intelligence-mcp.workers.dev/mcp`; `.github/workflows/mcp-registry.yml` republishes on every `server.json` version bump. Check: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.2016judea/artists-in-residence"`.

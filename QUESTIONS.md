# Questions people bring, and the tool that answers each

Per `~/.claude/CLAUDE.md`, *Every question theme gets a tool* (2026-11-22). The only usage log is
the D1 table `calls (day, tool, n)` in `artists-in-residence-usage`: per-day, per-tool counts, no
arguments (by design, see /privacy). To 2026-11-22 it holds 37 calls: 31 on 2026-11-20 (the
directory filing's own live cases) and 4 on 2026-11-21 (`list_artists` 2, `ramon_y_cajal` 1,
`isaac_newton` 1). Rows dated 2026-11-23 UTC are the live-case run for this pass. So the logs rank
nothing yet, and every theme below is **inferred**: it comes from what a person asks a chatbot
when they want a public-domain picture, not from our logs.

Read the logs with:

    cd worker && npx wrangler d1 execute artists-in-residence-usage --remote \
      --command "SELECT day, tool, n FROM calls ORDER BY day DESC, n DESC"

## Now logged (2026-11-22)

- `<tool>:miss`: a subject that found no exact match (the tool fell back to closest or highlights).
- `unknown:<name>`: a `tools/call` for a tool that doesn't exist (letters, digits, `_.-`, 60 chars).
  The cheapest list of missing doors there is. Read both before the next pass.

## From the logs

| theme | user's words | calls | tool |
|---|---|---|---|
| one artist's works | "show me Cajal's drawings of the retina" | 4 real (2026-11-21) | the five artist tools |
| who's here | "which artists are in this?" | 2 real | `list_artists` |

## Theme doors (shipped 2026-11-22, all inferred)

| theme | user's words | tool | engine |
|---|---|---|---|
| a picture of X, any artist | "find a public-domain image of a horse" | `public_domain_art_about` | search over all five catalogs, exact matches interleaved, counts per artist |
| can I use it / how do I credit it | "how do I credit the Vitruvian Man" | `how_to_credit_artwork` | title lookup: licence as the institution states it, credit, source, a ready attribution line |
| art from a year | "art made in 1910", "Leonardo around 1505" | `art_from_year` | dated works in a span (Hine 1867-1940, Leonardo 1470-1520, ...) |
| something to look at today | "art of the day", "a random artwork" | `artwork_of_the_day` | the 46 highlights, one per UTC day |
| child labor photos | "Lewis Hine child labor photos" | `child_labor_photographs` | Hine, "child labor" (1,200 matches) |
| neuron drawings | "Cajal's neuron drawings" | `neuron_drawings` | Cajal, "neurons" |
| Leonardo anatomy | "da Vinci skull drawing" | `leonardo_anatomy_drawings` | Leonardo, "anatomy" (16) |
| Leonardo inventions | "Leonardo's flying machine" | `leonardo_inventions` | Leonardo, "machine" (10) |
| constructivist posters | "Red Wedge poster" | `constructivist_posters` | Lissitzky, "poster" (7) |

All are thin wrappers over `search()` and the shared answer (credit, licence, source, one image).
If none of the listed works' images loads (tile.loc.gov refuses Workers), the next match past the
list is shown and described, so a door always comes back with a picture when one exists.

## Gaps left, and why

| theme | user's words | why not yet |
|---|---|---|
| an artist we don't carry | "public-domain Van Gogh" | five artists by design; `public_domain_art_about` says who is here |
| a famous painting not in the catalog | "the Mona Lisa" | the catalog is drawings, prints and photographs from open-access sets; the credit door says it isn't held |
| print it / buy a print | "can I order a print of this" | not a store; Substack in Print is the printing product |
| higher resolution | "a 300 dpi version" | every result links the institution's full-resolution file; no door ranks by pixel size |
| similar works | "more like this one" | no similarity index; search by the work's subject instead |

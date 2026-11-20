/**
 * Search over a catalog that ships with the Worker. No live museum search at call time:
 * a weak upstream search can't break a tool call, and a stranger's query costs one
 * in-memory scan.
 *
 * Each work carries precomputed, space-padded token strings (catalog/index.py): `kt` tags,
 * `kn` title, `ko` medium/institution/description. A query word found in kt scores 3, kn 2,
 * ko 1; a four-digit year in the query equal to the work's year scores 3; matching every
 * query word adds 2; the hand-tagged issue sheets get a 0.5 tie-break. Precomputing matters:
 * Workers Free allows 10 ms of CPU per request, and tokenising ~9,000 records on a cold
 * isolate would spend it several times over.
 *
 * Nothing scores → closest by tag (a query word that starts a tag token or vice versa) →
 * the highlights. A call never returns an empty list.
 */

export interface Work {
  id: string;
  title: string;
  date: string;
  year: number | null;
  medium: string;
  institution: string;
  licence: string;
  credit: string;
  source_url: string;
  image_url: string;
  thumb_url: string;
  tags: string[];
  description: string;
  featured?: boolean;
  kt?: string;
  kn?: string;
  ko?: string;
}

export interface Catalog {
  slug: string;
  name: string;
  built: string;
  count: number;
  works: Work[];
}

// catalog/index.py reads this list out of this file, so the two tokenisers share it.
const STOP = new Set(
  (
    "a an and the of in on at to for from by with as is are was were be this that these those it its his " +
    "her their our your or but into over under up down out off all any some show me find give want " +
    "looking look work works picture pictures image images drawing drawings photo photos photograph " +
    "photographs please something about like one two de del la le les el y et da di"
  ).split(" "),
);

/** Must match stem() in catalog/index.py (npm test checks the two agree). */
export function stem(w: string): string {
  let s = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("es") && /(ss|x|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return s;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

const pad = (ts: string[]) => ` ${[...new Set(ts)].join(" ")} `;

function keys(w: Work): { kt: string; kn: string; ko: string } {
  if (w.kt !== undefined && w.kn !== undefined && w.ko !== undefined) return { kt: w.kt, kn: w.kn, ko: w.ko };
  return {
    kt: pad(w.tags.flatMap((t) => tokens(t))),
    kn: pad(tokens(w.title)),
    ko: pad(tokens([w.medium, w.institution, w.description].join(" "))),
  };
}

export interface SearchResult {
  works: Work[];
  matched: "exact" | "closest" | "featured";
  total: number;
}

function highlights(cat: Catalog, limit: number): SearchResult {
  const f = cat.works.filter((w) => w.featured);
  return { works: f.slice(0, limit), matched: "featured", total: f.length };
}

export function search(cat: Catalog, query: string, limit: number): SearchResult {
  const q = tokens(query ?? "");
  const years = ((query ?? "").match(/\b1[0-9]{3}\b/g) ?? []).map(Number);
  const words = q.filter((t) => !/^\d{4}$/.test(t)).map((t) => ` ${t} `);
  if (!q.length) return highlights(cat, limit);
  const need = words.length + (years.length ? 1 : 0);
  const scored: { w: Work; s: number }[] = [];
  for (const w of cat.works) {
    const k = keys(w);
    let s = 0;
    let hits = 0;
    for (const t of words) {
      const v = k.kt.includes(t) ? 3 : k.kn.includes(t) ? 2 : k.ko.includes(t) ? 1 : 0;
      if (v) {
        s += v;
        hits++;
      }
    }
    if (years.length && w.year && years.includes(w.year)) {
      s += 3;
      hits++;
    }
    if (!hits) continue;
    if (hits === need) s += 2;
    if (w.featured) s += 0.5;
    // tile.loc.gov refuses Worker fetches (403), so of two equal matches show the one whose picture loads.
    if (!w.thumb_url.includes("loc.gov/")) s += 0.25;
    scored.push({ w, s });
  }
  if (scored.length) {
    scored.sort((a, b) => b.s - a.s);
    return { works: scored.slice(0, limit).map((x) => x.w), matched: "exact", total: scored.length };
  }
  // Closest by tag: a query word that starts a tag token, or a tag token that starts the word.
  const stems = words.map((t) => t.trim()).filter((t) => t.length >= 3);
  const close: { w: Work; s: number }[] = [];
  for (const w of cat.works) {
    const tagStems = keys(w).kt.trim().split(" ");
    let s = 0;
    for (const t of stems) if (tagStems.some((g) => g.length >= 3 && (g.startsWith(t) || t.startsWith(g)))) s += 1;
    if (s) close.push({ w, s: s + (w.featured ? 0.5 : 0) });
  }
  if (close.length) {
    close.sort((a, b) => b.s - a.s);
    return { works: close.slice(0, limit).map((x) => x.w), matched: "closest", total: close.length };
  }
  return highlights(cat, limit);
}

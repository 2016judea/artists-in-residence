// Offline checks on the shipped catalogs and the search. Run: npm test
import { readFileSync } from "node:fs";
import { search, type Catalog } from "../src/search.ts";

const load = (s: string): Catalog => JSON.parse(readFileSync(new URL(`../src/catalog/${s}.json`, import.meta.url), "utf8"));
let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails++; };

const PD = /public domain|cc0|no known restrictions|no restrictions/i;
for (const s of ["leonardo-da-vinci", "isaac-newton", "ramon-y-cajal", "el-lissitzky", "lewis-hine"]) {
  const c = load(s);
  ok(c.works.length > 0 && c.count === c.works.length, `${s}: ${c.count} works`);
  ok(c.works.every((w) => PD.test(w.licence)), `${s}: every licence is public domain / CC0 / no known restrictions`);
  ok(c.works.every((w) => w.source_url && w.image_url && w.thumb_url && w.credit), `${s}: every work has source, image, thumb, credit`);
  ok(search(c, "", 5).works.length > 0, `${s}: empty subject returns highlights`);
  ok(search(c, "zzqx unmatched nonsense", 5).works.length > 0, `${s}: nonsense subject still returns works`);
}
const lis = load("el-lissitzky");
ok(lis.works.every((w) => w.year !== null && w.year <= 1930), "el-lissitzky: every work dated 1930 or earlier");

const cases: [string, string, RegExp][] = [
  ["leonardo-da-vinci", "flying machine", /fly|flight|wing|machine/i],
  ["leonardo-da-vinci", "horses", /horse/i],
  ["isaac-newton", "principia title page", /principia/i],
  ["ramon-y-cajal", "retina", /retin/i],
  ["el-lissitzky", "proun", /proun/i],
  ["lewis-hine", "empire state building", /empire state/i],
  ["lewis-hine", "newsboys", /news/i],
];
for (const [s, q, re] of cases) {
  const r = search(load(s), q, 5);
  ok(r.matched === "exact" && re.test(r.works[0]?.title ?? "") , `${s} "${q}" -> ${r.matched}: ${r.works[0]?.title.slice(0, 70)}`);
}

// The build-time tokens (catalog/index.py) must match the runtime tokeniser, or queries miss.
import { tokens } from "../src/search.ts";
let drift = 0, checked = 0;
for (const s of ["leonardo-da-vinci", "isaac-newton", "ramon-y-cajal", "el-lissitzky", "lewis-hine"]) {
  for (const w of load(s).works.slice(0, 400)) {
    if (w.kn === undefined) continue;
    checked++;
    const ts = ` ${[...new Set(tokens(w.title))].join(" ")} `;
    if (ts !== w.kn) { drift++; if (drift < 4) console.log(`  drift: ${JSON.stringify(w.kn)} vs ${JSON.stringify(ts)}`); }
  }
}
ok(checked > 0 && drift === 0, `python and typescript tokenisers agree on ${checked} titles (${drift} differ)`);
if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");

import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { search, tokens, type Catalog, type Work } from "./search.js";
import { admit, note, type UsageEnv } from "./usage.js";
import artistsMeta from "./catalog/artists.json";
import leonardo from "./catalog/leonardo-da-vinci.json";
import newton from "./catalog/isaac-newton.json";
import cajal from "./catalog/ramon-y-cajal.json";
import lissitzky from "./catalog/el-lissitzky.json";
import hine from "./catalog/lewis-hine.json";

export interface Env extends UsageEnv {
  ASSETS: Fetcher;
}

interface ArtistMeta {
  slug: string;
  tool: string;
  name: string;
  served: string[];
  summary: string;
  years: string;
  kinds: Record<string, string>;
  examples: string[];
}

export const NAME = "Artists in Residence";
export const INDEPENDENCE =
  "Independent; not affiliated with the Library of Congress, the Art Institute of Chicago, the Wellcome " +
  "Collection, Wikimedia Commons, the Internet Archive or any museum or library.";

const CATALOGS: Record<string, Catalog> = {
  "leonardo-da-vinci": leonardo as Catalog,
  "isaac-newton": newton as Catalog,
  "ramon-y-cajal": cajal as Catalog,
  "el-lissitzky": lissitzky as Catalog,
  "lewis-hine": hine as Catalog,
};
export const ARTISTS = artistsMeta as ArtistMeta[];
const ARTIST_TOOLS = ["list_artists", ...ARTISTS.map((a) => a.tool)];

const INSTRUCTIONS =
  `${NAME} returns real public-domain works by five artists, from museum and library open-access ` +
  "collections, catalogued ahead of time with each work's licence, credit and source page. " +
  "When showing a work, give its credit line and licence and link its source page. Nothing here is " +
  "generated: every result is the artist's own work as the holding institution published it. " +
  "Shortcuts for common questions: public_domain_art_about (any subject, all five artists), how_to_credit_artwork, " +
  "art_from_year, artwork_of_the_day, and theme doors (child_labor_photographs, neuron_drawings, " +
  "leonardo_anatomy_drawings, leonardo_inventions, constructivist_posters). " +
  INDEPENDENCE;

const UA = "artists-in-residence-mcp/0.1 (+https://github.com/2016judea/artists-in-residence)";
const MAX_IMAGE_BYTES = 1_800_000;

function absolute(url: string, origin: string): string {
  return /^https?:\/\//.test(url) ? url : `${origin}/${url.replace(/^\//, "")}`;
}

async function fetchImage(env: Env, url: string, origin: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const abs = absolute(url, origin);
    const res = abs.startsWith(origin)
      ? await env.ASSETS.fetch(new Request(abs))
      : await fetch(abs, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(9000) });
    if (!res.ok) {
      console.log(JSON.stringify({ ev: "image_fail", host: new URL(abs).host, status: res.status }));
      return null;
    }
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { data: Buffer.from(buf).toString("base64"), mimeType: type };
  } catch (e) {
    console.log(JSON.stringify({ ev: "image_error", error: String(e).slice(0, 200) }));
    return null;
  }
}

function describe(w: Work, i: number, origin: string): string {
  const lines = [
    `${i + 1}. ${w.title}${w.date ? ` (${w.date})` : ""}`,
    w.medium ? `   Medium: ${w.medium}` : "",
    w.institution ? `   Held by: ${w.institution}` : "",
    `   Credit: ${w.credit}`,
    `   Licence: ${w.licence}`,
    `   Source: ${w.source_url}`,
    `   Full image: ${absolute(w.image_url, origin)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function capped(cap: number): CallToolResult {
  return { content: [{ type: "text", text: `Today's free allowance for ${NAME} is used up (${cap} calls). It resets at 00:00 UTC.` }] };
}

/** The shared answer: every work described, then the first one whose picture loads as an image. */
async function respond(env: Env, origin: string, head: string, works: Work[], extra: Work[] = []): Promise<CallToolResult> {
  const body = works.map((w, i) => describe(w, i, origin)).join("\n\n");
  const content: CallToolResult["content"] = [{ type: "text", text: body ? `${head}\n\n${body}` : head }];
  // The first match as an image; if its host refuses (tile.loc.gov 403s every Worker), the next one,
  // then the next-best matches past the list (`extra`), described in full when one of those is shown.
  const tries = [...works.slice(0, 5), ...extra.slice(0, 5)];
  for (const [i, w] of tries.entries()) {
    const img = await fetchImage(env, w.thumb_url, origin);
    if (img) {
      if (i >= Math.min(works.length, 5)) content.push({ type: "text", text: `Picture shown (the next match, whose image loads):\n${describe(w, works.length, origin)}` });
      content.push({ type: "text", text: `Image: ${w.title} — ${w.credit}. ${w.licence}.` });
      content.push({ type: "image", data: img.data, mimeType: img.mimeType });
      break;
    }
  }
  return { content };
}

function artistTool(server: McpServer, env: Env, a: ArtistMeta, origin: string) {
  const cat = CATALOGS[a.slug]!;
  const ex = a.examples.slice(0, 3);
  server.registerTool(
    a.tool,
    {
      title: a.name,
      description:
        `Searches ${cat.count} public-domain works by ${a.name} (${a.years}) catalogued from open-access ` +
        `museum and library collections. ${a.summary} Returns the best matches for a subject: the first as an ` +
        "image, and every match with title, date, medium, holding institution, credit, licence, source page and " +
        "full-resolution link. With no subject, returns highlights. Real works only; nothing is generated.\n\n" +
        "Example invocations:\n" +
        ex.map((e) => `- "Find ${a.name} works showing ${e}"`).join("\n"),
      inputSchema: z.object({
        subject: z
          .string()
          .max(200)
          .optional()
          .describe(`What to look for, in plain words: a subject, motif, place, medium or year (e.g. "${ex[0] ?? ""}").`),
        limit: z.number().int().min(1).max(10).optional().describe("How many matches to list (1-10, default 5)."),
      }),
      annotations: { title: a.name, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args): Promise<CallToolResult> => {
      const gate = await admit(env, a.tool);
      if (!gate.ok) return capped(gate.cap);
      const subject = (args.subject ?? "").trim();
      const limit = args.limit ?? 5;
      const wide = search(cat, subject, limit + 5);
      const r = { ...wide, works: wide.works.slice(0, limit) };
      const head =
        r.matched === "exact"
          ? `${r.total} of ${cat.count} public-domain works by ${a.name} match "${subject}". Top ${r.works.length}:`
          : r.matched === "closest"
            ? `No work by ${a.name} matches "${subject}" exactly. Closest by tag (${r.works.length}):`
            : subject
              ? `No work by ${a.name} matches "${subject}". Highlights instead (${r.works.length}):`
              : `Highlights from ${cat.count} public-domain works by ${a.name}:`;
      console.log(JSON.stringify({ ev: "call", tool: a.tool, matched: r.matched, n: r.works.length }));
      if (subject && r.matched !== "exact") await note(env, `${a.tool}:miss`);
      return respond(env, origin, head, r.works, wide.works.slice(limit));
    },
  );
}

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const SLUGS = Object.keys(CATALOGS);
const nameOf = (slug: string) => ARTISTS.find((a) => a.slug === slug)?.name ?? slug;
const LIMIT = z.number().int().min(1).max(10).optional().describe("How many works to list (1-10, default 5).");

/** Every catalog searched, exact matches only, interleaved so no one artist fills the list. */
function acrossArtists(subject: string, limit: number): { works: Work[]; counts: [string, number][] } {
  const per = SLUGS.map((slug) => ({ slug, r: search(CATALOGS[slug]!, subject, limit) })).filter((x) => x.r.matched === "exact");
  per.sort((a, b) => b.r.total - a.r.total);
  const works: Work[] = [];
  for (let i = 0; works.length < limit && i < limit; i++) for (const x of per) if (x.r.works[i] && works.length < limit) works.push(x.r.works[i]!);
  return { works, counts: per.map((x) => [nameOf(x.slug), x.r.total]) };
}

/** The work whose title best matches a title someone typed or pasted. */
function byTitle(title: string, artist?: string): { w: Work; slug: string } | null {
  const want = title.trim().toLowerCase();
  const q = new Set(tokens(title));
  let best: { w: Work; slug: string; s: number } | null = null;
  for (const slug of SLUGS) {
    if (artist && !nameOf(slug).toLowerCase().includes(artist.trim().toLowerCase()) && !slug.includes(artist.trim().toLowerCase())) continue;
    for (const w of CATALOGS[slug]!.works) {
      const t = w.title.toLowerCase();
      let s = t === want ? 100 : t.includes(want) && want.length > 6 ? 50 : 0;
      if (!s && q.size) {
        const tt = new Set(tokens(w.title));
        let hit = 0;
        for (const x of q) if (tt.has(x)) hit++;
        s = (hit / q.size) * 10 + (hit / Math.max(tt.size, 1));
        if (hit / q.size < 0.6) s = 0;
      }
      if (s && (!best || s > best.s)) best = { w, slug, s };
    }
  }
  return best;
}

interface Door {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  run: (args: Record<string, any>) => { head: string; works: Work[]; extra?: Work[]; miss?: boolean };
}

/** A subject door: one artist's catalog with a fixed theme, optionally narrowed. */
function themed(name: string, title: string, slug: string, theme: string, what: string, examples: string[]): Door {
  return {
    name,
    title,
    description:
      `${what} Real public-domain works from open-access collections, each with title, date, medium, holding ` +
      "institution, credit, licence, source page and full-resolution link; the first comes back as an image.\n\n" +
      "Example questions:\n" + examples.map((e) => `- "${e}"`).join("\n"),
    input: z.object({
      narrow: z.string().max(120).optional().describe("Optional extra words to narrow the theme (a place, year or motif)."),
      limit: LIMIT,
    }),
    run: (a) => {
      const q = `${theme} ${String(a.narrow ?? "").trim()}`.trim();
      const limit = a.limit ?? 5;
      const r = search(CATALOGS[slug]!, q, limit + 5);
      const works = r.works.slice(0, limit);
      const head =
        r.matched === "exact"
          ? `${r.total} public-domain works by ${nameOf(slug)} match "${q}". Top ${works.length}:`
          : `No work by ${nameOf(slug)} matches "${q}" exactly. Closest (${works.length}):`;
      return { head, works, extra: r.works.slice(limit), miss: r.matched !== "exact" };
    },
  };
}

export const DOORS: Door[] = [
  {
    name: "public_domain_art_about",
    title: "Public-Domain Art About a Subject",
    description:
      "Searches all five artists' catalogs at once (Leonardo da Vinci, Isaac Newton, Santiago Ramón y Cajal, El " +
      "Lissitzky, Lewis Hine; about 8,000 public-domain works) for one subject, and returns the matches with how many " +
      "each artist has, each work's credit, licence, source page and full-resolution link, and the first as an image.\n\n" +
      "Example questions:\n- \"Find a public-domain image of a horse\"\n- \"Free-to-use historical art of machines\"\n" +
      "- \"Public-domain pictures of factories\"",
    input: z.object({ subject: z.string().min(1).max(200).describe("The subject in plain words, e.g. 'horse', 'factory', 'brain'."), limit: LIMIT }),
    run: (a) => {
      const subject = String(a.subject).trim();
      const r = acrossArtists(subject, a.limit ?? 5);
      if (!r.works.length) {
        return {
          head: `None of the five artists has a work matching "${subject}". The catalogs cover: ${ARTISTS.map((x) => `${x.name} (${x.examples.slice(0, 2).join(", ")})`).join("; ")}.`,
          works: [],
          miss: true,
        };
      }
      const counts = r.counts.map(([n, c]) => `${n} ${c}`).join(", ");
      return { head: `Public-domain works matching "${subject}", by artist: ${counts}. Top ${r.works.length}:`, works: r.works };
    },
  },
  {
    name: "how_to_credit_artwork",
    title: "How to Credit an Artwork",
    description:
      "Looks up one work by its title (as shown in a result or typed from memory) and returns its credit line, its " +
      "licence as the holding institution states it, the institution, the source page, and a ready attribution line.\n\n" +
      "Example questions:\n- \"How do I credit the Vitruvian Man?\"\n- \"Can I use Lewis Hine's Icarus, Empire State Building?\"\n" +
      "- \"What's the licence on Beat the Whites with the Red Wedge?\"",
    input: z.object({
      title: z.string().min(2).max(300).describe("The work's title, e.g. 'Vitruvian Man'."),
      artist: z.string().max(80).optional().describe("Optional artist name, to narrow the lookup."),
    }),
    run: (a) => {
      const hit = byTitle(String(a.title), a.artist);
      if (!hit) return { head: `No work titled like "${a.title}" is in the catalog of the five artists.`, works: [], miss: true };
      const w = hit.w;
      const line = `${w.title}${w.date ? ` (${w.date})` : ""}, ${nameOf(hit.slug)}. ${w.credit}. ${w.licence}. ${w.source_url}`;
      return {
        head:
          `Closest title in the catalog: "${w.title}" by ${nameOf(hit.slug)}.\n` +
          `Licence (as the holding institution states it): ${w.licence}\nCredit line: ${w.credit}\n` +
          (w.institution ? `Held by: ${w.institution}\n` : "") +
          `Source page: ${w.source_url}\n\nAttribution line to copy:\n${line}\n\nThe work in full:`,
        works: [w],
      };
    },
  },
  {
    name: "art_from_year",
    title: "Art From a Year",
    description:
      "Public-domain works across the five artists dated to one year or a span of years (works with no recorded year " +
      "are left out), with how many each artist has in that span, and each work's credit, licence and source page.\n\n" +
      "Example questions:\n- \"Art made in 1910\"\n- \"What was Leonardo drawing around 1505?\"\n- \"Photographs from 1908 to 1912\"",
    input: z.object({
      from: z.number().int().min(1400).max(1940).describe("First year, e.g. 1910."),
      to: z.number().int().min(1400).max(1940).optional().describe("Last year (default: same as from)."),
      artist: z.string().max(80).optional().describe("Optional artist name."),
      limit: LIMIT,
    }),
    run: (a) => {
      const from = a.from as number;
      const to = Math.max((a.to as number | undefined) ?? from, from);
      const limit = a.limit ?? 5;
      const per = SLUGS.filter((s) => !a.artist || nameOf(s).toLowerCase().includes(String(a.artist).toLowerCase()) || s.includes(String(a.artist).toLowerCase()))
        .map((slug) => {
          const ws = CATALOGS[slug]!.works.filter((w) => w.year !== null && w.year >= from && w.year <= to);
          ws.sort((x, y) => Number(!!y.featured) - Number(!!x.featured) || Number(!y.thumb_url.includes("loc.gov/")) - Number(!x.thumb_url.includes("loc.gov/")));
          return { slug, ws };
        })
        .filter((x) => x.ws.length);
      const span = from === to ? `${from}` : `${from}–${to}`;
      if (!per.length) {
        return { head: `No dated work from ${span}. Years covered: Leonardo 1470–1520, Newton 1661–1737, Cajal 1870–1930, Lissitzky 1910–1930, Hine 1867–1940.`, works: [], miss: true };
      }
      const works: Work[] = [];
      for (let i = 0; works.length < limit && i < limit; i++) for (const x of per) if (x.ws[i] && works.length < limit) works.push(x.ws[i]!);
      return { head: `Works dated ${span}, by artist: ${per.map((x) => `${nameOf(x.slug)} ${x.ws.length}`).join(", ")}. Top ${works.length}:`, works };
    },
  },
  {
    name: "artwork_of_the_day",
    title: "Artwork of the Day",
    description:
      "One highlighted public-domain work for today (UTC), the same for everyone all day, rotating through the five " +
      "artists' highlights, with its credit, licence, source page and image.\n\n" +
      "Example questions:\n- \"Show me today's artwork\"\n- \"Give me a random public-domain artwork\"\n- \"Art of the day\"",
    input: z.object({}),
    run: () => {
      const pool = SLUGS.flatMap((s) => CATALOGS[s]!.works.filter((w) => w.featured).map((w) => ({ w, s })));
      const day = Math.floor(Date.now() / 86_400_000);
      const pick = pool[day % pool.length]!;
      return { head: `Artwork of the day (${new Date().toISOString().slice(0, 10)}), by ${nameOf(pick.s)}:`, works: [pick.w] };
    },
  },
  themed("child_labor_photographs", "Child Labor Photographs (Lewis Hine)", "lewis-hine", "child labor",
    "Lewis Hine's National Child Labor Committee photographs (1908–1924): children at work in mills, mines, canneries, fields and on city streets, with his own captions.",
    ["Show me Lewis Hine's child labor photos", "Child labor photographs from cotton mills", "Historic photos of kids working in coal mines"]),
  themed("neuron_drawings", "Neuron Drawings (Ramón y Cajal)", "ramon-y-cajal", "neurons",
    "Santiago Ramón y Cajal's drawings of nerve cells and brain tissue (1890s–1920s), the figures that founded neuroscience.",
    ["Show me Cajal's neuron drawings", "Old scientific drawings of brain cells", "Cajal drawings of the nervous system"]),
  themed("leonardo_anatomy_drawings", "Anatomy Drawings (Leonardo da Vinci)", "leonardo-da-vinci", "anatomy",
    "Leonardo da Vinci's anatomical drawings: the skull, the fetus in the womb, muscles, the heart, the Vitruvian Man.",
    ["Show me Leonardo's anatomy drawings", "Da Vinci skull drawing", "Leonardo's drawing of the fetus"]),
  themed("leonardo_inventions", "Inventions and Machines (Leonardo da Vinci)", "leonardo-da-vinci", "machine",
    "Leonardo da Vinci's designs for machines and inventions: flying machines, wings, weapons, mechanisms.",
    ["Show me Leonardo's flying machine", "Da Vinci's inventions", "Leonardo machine drawings"]),
  themed("constructivist_posters", "Constructivist Posters (El Lissitzky)", "el-lissitzky", "poster",
    "El Lissitzky's posters and graphic design to 1930, including Beat the Whites with the Red Wedge.",
    ["Show me Soviet constructivist posters", "El Lissitzky Red Wedge poster", "Russian avant-garde graphic design"]),
];

export const DOOR_NAMES = DOORS.map((d) => d.name);
export const TOOL_NAMES = [...ARTIST_TOOLS, ...DOOR_NAMES];

function registerDoors(server: McpServer, env: Env, origin: string) {
  for (const d of DOORS) {
    server.registerTool(
      d.name,
      { title: d.title, description: d.description, inputSchema: d.input, annotations: { title: d.title, ...RO } },
      async (args: Record<string, any>): Promise<CallToolResult> => {
        const gate = await admit(env, d.name);
        if (!gate.ok) return capped(gate.cap);
        const r = d.run(args);
        console.log(JSON.stringify({ ev: "call", tool: d.name, n: r.works.length, miss: !!r.miss }));
        if (r.miss) await note(env, `${d.name}:miss`);
        return respond(env, origin, r.head, r.works, r.extra);
      },
    );
  }
}

export function createServer(env: Env, origin: string): McpServer {
  const server = new McpServer({ name: "artists-in-residence", version: "0.1.0", title: NAME }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "list_artists",
    {
      title: "List Artists",
      description:
        "Lists the artists in residence: who they are, their dates, how many public-domain works each has in the " +
        "catalog, what kinds of work those are, the tool that searches each one, and example subjects.\n\n" +
        "Example invocations:\n" +
        '- "Which artists are in Artists in Residence?"\n' +
        '- "What can I search for in the Lewis Hine collection?"\n' +
        '- "How many Leonardo drawings are there?"',
      inputSchema: z.object({}),
      annotations: { title: "List Artists", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      const gate = await admit(env, "list_artists");
      if (!gate.ok) {
        return { content: [{ type: "text", text: `Today's free allowance for ${NAME} is used up. It resets at 00:00 UTC.` }] };
      }
      const text = ARTISTS.map((a) => {
        const c = CATALOGS[a.slug]!;
        return [
          `${a.name} (${a.years}) — tool \`${a.tool}\`, ${c.count} works (catalog built ${c.built})`,
          `  ${a.summary}`,
          `  Try: ${a.examples.join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n");
      }).join("\n\n");
      return { content: [{ type: "text", text: `${NAME}: real public-domain works, catalogued with licence and credit.\n\n${text}\n\n${INDEPENDENCE}` }] };
    },
  );

  for (const a of ARTISTS) artistTool(server, env, a, origin);
  registerDoors(server, env, origin);
  return server;
}

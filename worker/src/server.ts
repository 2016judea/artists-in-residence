import { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { search, type Catalog, type Work } from "./search.js";
import { admit, type UsageEnv } from "./usage.js";
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
export const TOOL_NAMES = ["list_artists", ...ARTISTS.map((a) => a.tool)];

const INSTRUCTIONS =
  `${NAME} returns real public-domain works by five artists, from museum and library open-access ` +
  "collections, catalogued ahead of time with each work's licence, credit and source page. " +
  "When showing a work, give its credit line and licence and link its source page. Nothing here is " +
  "generated: every result is the artist's own work as the holding institution published it. " +
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
      if (!gate.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Today's free allowance for ${NAME} is used up (${gate.cap} calls). It resets at 00:00 UTC.`,
            },
          ],
        };
      }
      const subject = (args.subject ?? "").trim();
      const limit = args.limit ?? 5;
      const r = search(cat, subject, limit);
      const head =
        r.matched === "exact"
          ? `${r.total} of ${cat.count} public-domain works by ${a.name} match "${subject}". Top ${r.works.length}:`
          : r.matched === "closest"
            ? `No work by ${a.name} matches "${subject}" exactly. Closest by tag (${r.works.length}):`
            : subject
              ? `No work by ${a.name} matches "${subject}". Highlights instead (${r.works.length}):`
              : `Highlights from ${cat.count} public-domain works by ${a.name}:`;
      const body = r.works.map((w, i) => describe(w, i, origin)).join("\n\n");
      console.log(JSON.stringify({ ev: "call", tool: a.tool, matched: r.matched, n: r.works.length }));
      const content: CallToolResult["content"] = [{ type: "text", text: `${head}\n\n${body}` }];
      // The first match as an image; if its host refuses (tile.loc.gov 403s every Worker), the next one.
      for (const w of r.works.slice(0, 5)) {
        const img = await fetchImage(env, w.thumb_url, origin);
        if (img) {
          content.push({ type: "text", text: `Image: ${w.title} — ${w.credit}. ${w.licence}.` });
          content.push({ type: "image", data: img.data, mimeType: img.mimeType });
          break;
        }
      }
      return { content };
    },
  );
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
  return server;
}

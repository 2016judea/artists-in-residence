// The directory test cases, run against a live endpoint through the official MCP client.
//   node scripts/live_cases.mjs [https://.../mcp]
// Lists the tools, calls list_artists, then each artist with two subjects, and checks that
// every call returns text with a credit and licence and that the artist calls carry an image.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { writeFileSync, mkdirSync } from "node:fs";

const URL_ = process.argv[2] ?? "https://artists-in-residence.small-business-intelligence-mcp.workers.dev/mcp";
const OUT = process.env.LIVE_OUT ?? "/tmp/air-live";
const CASES = [
  ["leonardo_da_vinci", "flying machine"], ["leonardo_da_vinci", "horses"],
  ["isaac_newton", "principia title page"], ["isaac_newton", "comet orbit"],
  ["ramon_y_cajal", "retina"], ["ramon_y_cajal", "purkinje cells"],
  ["el_lissitzky", "proun"], ["el_lissitzky", "poster"],
  ["lewis_hine", "empire state building"], ["lewis_hine", "newsboys"],
  ["lewis_hine", "zzqx qqvv"],
];

const client = new Client({ name: "air-live-cases", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));
const tools = await client.listTools();
console.log(`tools/list: ${tools.tools.map((t) => t.name).join(", ")}`);
let fails = 0;
const check = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
check(tools.tools.every((t) => t.title && t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false),
  "every tool has a title and read-only, non-destructive annotations");

const la = await client.callTool({ name: "list_artists", arguments: {} });
check(!la.isError && /Leonardo/.test(la.content[0].text), `list_artists: ${la.content[0].text.split("\n")[0]}`);
mkdirSync(OUT, { recursive: true });
for (const [tool, subject] of CASES) {
  const t0 = Date.now();
  const r = await client.callTool({ name: tool, arguments: { subject, limit: 3 } });
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const img = r.content.find((c) => c.type === "image");
  if (img) writeFileSync(`${OUT}/${tool}-${subject.replace(/\W+/g, "-")}.jpg`, Buffer.from(img.data, "base64"));
  const first = text.split("\n").find((l) => /^1\. /.test(l)) ?? "";
  check(!r.isError && /Licence:/.test(text) && /Credit:/.test(text) && !!img,
    `${tool} "${subject}" (${Date.now() - t0} ms): ${text.split("\n")[0].slice(0, 90)} | ${first.slice(0, 80)} | image ${img ? Math.round(img.data.length * 0.75 / 1024) + " KB" : "NONE"}`);
}
await client.close();
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);

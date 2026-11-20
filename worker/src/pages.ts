import { ARTISTS, INDEPENDENCE, NAME } from "./server.js";

const CSS = `
:root{--ink:#1b1713;--paper:#f3efe6;--muted:#6b6258;--red:#b8321f;--line:#d9d1c3}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.5 Georgia,'Times New Roman',serif}
main{max-width:680px;margin:0 auto;padding:40px 20px 64px}
h1{font-size:34px;line-height:1.1;margin:0 0 8px}h2{font-size:18px;margin:32px 0 8px}
p{margin:0 0 14px}.lede{font-size:20px}
code,.url{font:15px/1.4 ui-monospace,Menlo,monospace}
.url{display:block;background:#fff;border:1px solid var(--line);padding:12px 14px;margin:8px 0 6px;word-break:break-all}
ul{padding-left:20px}li{margin:6px 0}.muted{color:var(--muted);font-size:15px}a{color:var(--red)}
`;

function page(title: string, body: string, origin: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="icon" href="${origin}/icon.png"><style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

export function landingHtml(origin: string): string {
  const list = ARTISTS.map((a) => `<li><b>${a.name}</b> (${a.years}). ${a.summary}</li>`).join("");
  return page(
    NAME,
    `<h1>${NAME}</h1>
<p class="lede">Real public-domain works by five artists, inside Claude. Ask for a subject; get the work, its credit and its licence.</p>
<p>Add it to Claude as a custom connector with this URL. No account, no key.</p>
<code class="url">${origin}/mcp</code>
<p class="muted">Claude: Settings → Connectors → Add custom connector.</p>
<h2>The artists</h2><ul>${list}</ul>
<h2>Where the works come from</h2>
<p>Wikimedia Commons, the Library of Congress, the Art Institute of Chicago, the Wellcome Collection and the Internet Archive. A work is in the catalog only if its source marks it public domain, CC0 or "no known restrictions". El Lissitzky's works are limited to 1930 and earlier. Nothing here is generated.</p>
<p class="muted">${INDEPENDENCE}</p>
<p class="muted"><a href="${origin}/privacy">Privacy</a> · <a href="https://github.com/2016judea/artists-in-residence">Source</a> · <a href="https://github.com/2016judea/artists-in-residence/issues">Support</a></p>`,
    origin,
  );
}

export function privacyHtml(origin: string): string {
  return page(
    `Privacy · ${NAME}`,
    `<h1>Privacy</h1>
<p>${NAME} needs no account and asks for nothing about you.</p>
<p><b>What is kept.</b> A count of tool calls per tool per day, used to see whether anyone uses it and to stop at a daily limit. Each request also writes a log line with the request method and the tool name. Neither the count nor the log holds what you searched for, your IP address or anything that identifies you.</p>
<p><b>What Cloudflare sees.</b> The server runs on Cloudflare Workers. Cloudflare processes each request (including your IP address) to deliver it, under <a href="https://www.cloudflare.com/privacypolicy/">its privacy policy</a>.</p>
<p><b>Images.</b> When a tool returns a picture, the server fetches it from the holding institution's image host (Wikimedia, the Library of Congress, the Art Institute of Chicago, the Wellcome Collection) or from its own copy. Those hosts see a request from Cloudflare, not from you.</p>
<p><b>Nothing is sold or shared.</b> There are no ads, no trackers and no third-party analytics.</p>
<p>Questions: <a href="https://github.com/2016judea/artists-in-residence/issues">github.com/2016judea/artists-in-residence/issues</a>. Publisher: Brick and Mortar AI LLC, Saint Paul, Minnesota.</p>
<p class="muted">${INDEPENDENCE} Updated 2026-11-20.</p>
<p class="muted"><a href="${origin}/">${NAME}</a></p>`,
    origin,
  );
}

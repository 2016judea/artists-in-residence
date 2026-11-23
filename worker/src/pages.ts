import { ARTISTS, INDEPENDENCE, NAME } from "./server.js";

export const SUPPORT = "https://brickandmortar.dev/contact";

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
<p class="muted"><a href="${origin}/privacy">Privacy</a> · <a href="${SUPPORT}">Support</a></p>`,
    origin,
  );
}

export function privacyHtml(origin: string): string {
  return page(
    `Privacy · ${NAME}`,
    `<h1>Privacy</h1>
<p class="muted">Last updated November 22, 2026. ${NAME} is published by Brick and Mortar AI LLC, Saint Paul, Minnesota, which is responsible for the data described here.</p>
<p>${NAME} needs no account, no sign-in and no key, and it never asks for your name, email or anything else about you.</p>
<h2>What the connector receives</h2>
<p>When Claude, ChatGPT or another assistant calls a tool, the server receives that tool's arguments: the artist and subject you asked about, a work id, or a search phrase. It does not receive your conversation, your account or your files.</p>
<h2>What it does with it</h2>
<p>The arguments are used to look up works in a catalogue built ahead of time, and the answer is sent back. They are then dropped. They are not stored, not shared, not sold and not used to train any model. No AI model runs on our side; the assistant you are using does the reasoning.</p>
<h2>What is counted</h2>
<p>A count of tool calls per tool per day, kept in a Cloudflare D1 database, used to see whether anyone uses it and to stop at a daily limit. Each request also writes a log line with the request method and the tool name. Neither the count nor the log holds what you searched for, your IP address or anything that identifies you. Each tool call also sends one event to PostHog: the tool name, whether it succeeded, how long it took, and the kind of app that called it (Claude, ChatGPT, a script and so on) with the first word of its user agent. The event carries no arguments, no results, no IP address and no id that links one call to another.</p>
<h2>Images</h2>
<p>When a tool returns a picture, the server fetches it from the holding institution's image host (Wikimedia, the Library of Congress, the Art Institute of Chicago, the Wellcome Collection) or from its own copy. Those hosts see a request from Cloudflare, not from you, and nothing about you is sent with it.</p>
<h2>Website analytics</h2>
<p>These pages carry no ads, no trackers, no cookies and no third-party analytics.</p>
<h2>Who else handles it</h2>
<p>The server runs on Cloudflare Workers. Cloudflare processes each request (including your IP address) to deliver it, under <a href="https://www.cloudflare.com/privacypolicy/">its privacy policy</a>. The assistant you call the connector from handles your conversation under its own policy.</p>
<h2>Your choices</h2>
<p>You can remove the connector from your assistant at any time. Because nothing identifying is kept, there is no personal data of yours for us to export or delete; if you think otherwise, write to us and we will look.</p>
<h2>Children</h2>
<p>The service is not directed to children under 13, and we do not knowingly collect information from them.</p>
<h2>Changes</h2>
<p>If this policy changes, the new version will be posted here with a new date.</p>
<h2>Contact</h2>
<p><a href="${SUPPORT}">brickandmortar.dev/contact</a></p>
<p class="muted">${INDEPENDENCE}</p>
<p class="muted"><a href="${origin}/">${NAME}</a></p>`,
    origin,
  );
}

export function demoHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Review recording · ${NAME}</title><style>${CSS}
video{width:100%;max-width:100%;background:#000;aspect-ratio:16/10}</style></head><body><main>
<h1>${NAME} in ChatGPT</h1>
<p class="muted">A screen recording for app review: the connector added to ChatGPT, then the listed test prompts run end to end. Not indexed.</p>
<video src="/demo/chatgpt.mp4" controls playsinline preload="metadata"></video>
</main></body></html>`;
}

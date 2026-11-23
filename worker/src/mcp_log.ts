// One PostHog `mcp_tool_call` event per MCP tool call, so this connector's usage reads in the same
// place as every other one (~/Desktop/workspace/mcp-metrics, the `mcp-usage` skill). Same event and
// properties as appeal-draft's logger; this file is copied verbatim into each Cloudflare worker.
//
// Sent: the server, the tool's name, the host app (claude / chatgpt / grok / cursor / script / other)
// and the first word of the user agent, ok, found:false when the result says so, and milliseconds.
// Never the tool's arguments, never its results, never an IP. claude.ai and ChatGPT call from their
// own servers, so the user agent is the platform's, not a person's; distinct_id is random per call.
// The response is read only to see whether it is an error or a not-found; nothing from it is sent.

const PH_KEY = "phc_yFgRGppL6H7DvhgZTQKbHdrY5oqnpLT482rrNYtLqnAx";

type Ctx = { waitUntil(p: Promise<unknown>): void };
type Fetch<E, C extends Ctx> = (req: Request, env: E, ctx: C) => Promise<Response> | Response;

export const clientOf = (ua: string): string =>
  /claude|anthropic/i.test(ua) ? "claude"
  : /openai|chatgpt/i.test(ua) ? "chatgpt"
  : /grok|xai/i.test(ua) ? "grok"
  : /cursor/i.test(ua) ? "cursor"
  : /node|undici|python|curl/i.test(ua) ? "script"
  : "other";

function toolNames(body: string): string[] {
  try {
    const m = JSON.parse(body);
    return (Array.isArray(m) ? m : [m])
      .filter((x) => x && x.method === "tools/call" && typeof x.params?.name === "string")
      .map((x) => String(x.params.name).slice(0, 64));
  } catch {
    return [];
  }
}

/** Wrap a worker's fetch. Only POSTs to /mcp* that call a tool are logged; everything else passes through. */
export function withMcpLog<E, C extends Ctx>(site: string, inner: Fetch<E, C>): (req: Request, env: E, ctx?: C) => Promise<Response> {
  return async (req, env, ctx) => {
    if (!ctx || typeof ctx.waitUntil !== "function") return inner(req, env, ctx as unknown as C); // tests call fetch without a context: nothing logged
    if (req.method !== "POST" || !new URL(req.url).pathname.startsWith("/mcp")) return inner(req, env, ctx);
    let tools: string[] = [];
    try { tools = toolNames(await req.clone().text()); } catch { /* unreadable body: not logged */ }
    if (!tools.length) return inner(req, env, ctx);

    const t0 = Date.now();
    const res = await inner(req, env, ctx);
    const ms = Date.now() - t0;
    const peek = res.status < 400 && res.body ? res.clone() : null;
    const ua = req.headers.get("user-agent") || "";
    const test = req.headers.get("x-mcp-test") === "1";

    const send = async () => {
      let ok = res.status < 400;
      let found: boolean | undefined;
      if (peek) {
        try {
          const text = await Promise.race([peek.text(), new Promise<string>((r) => setTimeout(() => r(""), 10000))]);
          if (/"isError"\s*:\s*true/.test(text)) ok = false;
          if (/\\?"found\\?"\s*:\s*false/.test(text)) found = false;
        } catch { /* keep the HTTP verdict */ }
      }
      await Promise.all(tools.map((tool) => {
        const props: Record<string, unknown> = {
          site, tool, ok, ms, client: clientOf(ua), client_ua: (ua.split(/[\/ ;(]/)[0] || "").slice(0, 30),
          $process_person_profile: false, $lib: site + "-mcp",
        };
        if (found !== undefined) props.found = found;
        if (res.status >= 400) props.status = res.status;
        if (test) props.test = true;
        return capture(props).catch(() => {});
      }));
    };
    ctx.waitUntil(send());
    return res;
  };
}

function capture(properties: Record<string, unknown>): Promise<Response> {
  return fetch("https://us.i.posthog.com/capture/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(1500),
    body: JSON.stringify({ api_key: PH_KEY, event: "mcp_tool_call", distinct_id: "mcp_call_" + crypto.randomUUID(), properties }),
  });
}

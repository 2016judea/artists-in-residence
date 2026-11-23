import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createServer, TOOL_NAMES, type Env } from "./server.js";
import { note } from "./usage.js";
import { demoHtml, landingHtml, privacyHtml } from "./pages.js";
import { withMcpLog } from "./mcp_log.js";

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, must-revalidate" };

/**
 * One log line per /mcp request: the JSON-RPC method and tool name, never the arguments (see /privacy).
 * A tools/call for a tool that doesn't exist is also counted in D1 as `unknown:<name>`: the cheapest list
 * of missing doors there is (QUESTIONS.md).
 */
async function logRpc(request: Request, env: Env): Promise<void> {
  if (request.method !== "POST") return;
  try {
    const body: unknown = await request.clone().json();
    const first = (Array.isArray(body) ? body[0] : body) as { method?: string; params?: { name?: string } } | undefined;
    const tool = first?.method === "tools/call" ? first.params?.name : undefined;
    console.log(JSON.stringify({ ev: "rpc", method: first?.method, tool }));
    if (typeof tool === "string" && !TOOL_NAMES.includes(tool)) await note(env, `unknown:${tool.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60)}`);
  } catch {
    /* unparseable bodies are the handler's problem */
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    if (url.pathname === "/") return new Response(landingHtml(origin), { headers: HTML });
    if (url.pathname === "/privacy") return new Response(privacyHtml(origin), { headers: HTML });
    if (url.pathname === "/favicon.ico") return Response.redirect(`${origin}/icon.png`, 302);
    if (url.pathname === "/.well-known/openai-apps-challenge") {
      const token = (env.OPENAI_APPS_CHALLENGE ?? "").trim();
      return new Response(token || "not set", {
        status: token ? 200 : 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/demo/chatgpt" || url.pathname === "/demo/chatgpt/") {
      return new Response(demoHtml(), { headers: { ...HTML, "x-robots-tag": "noindex, nofollow" } });
    }
    if (url.pathname === "/mcp") {
      const rejected =
        hostHeaderValidationResponse(request, [...localhostAllowedHostnames(), url.hostname]) ??
        originValidationResponse(request, [...localhostAllowedOrigins(), origin]);
      if (rejected) return rejected;
      await logRpc(request, env);
      return createMcpHandler(() => createServer(env, origin)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// One PostHog event per tool call (mcp_log.ts); never arguments or results.
export default { ...worker, fetch: withMcpLog("artists-in-residence", worker.fetch) };

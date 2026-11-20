import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { createServer, type Env } from "./server.js";
import { landingHtml, privacyHtml } from "./pages.js";

const HTML = { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, must-revalidate" };

/** One log line per /mcp request: the JSON-RPC method and tool name, never the arguments (see /privacy). */
async function logRpc(request: Request): Promise<void> {
  if (request.method !== "POST") return;
  try {
    const body: unknown = await request.clone().json();
    const first = (Array.isArray(body) ? body[0] : body) as { method?: string; params?: { name?: string } } | undefined;
    console.log(JSON.stringify({ ev: "rpc", method: first?.method, tool: first?.method === "tools/call" ? first.params?.name : undefined }));
  } catch {
    /* unparseable bodies are the handler's problem */
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    if (url.pathname === "/") return new Response(landingHtml(origin), { headers: HTML });
    if (url.pathname === "/privacy") return new Response(privacyHtml(origin), { headers: HTML });
    if (url.pathname === "/favicon.ico") return Response.redirect(`${origin}/icon.png`, 302);
    if (url.pathname === "/mcp") {
      const rejected =
        hostHeaderValidationResponse(request, [...localhostAllowedHostnames(), url.hostname]) ??
        originValidationResponse(request, [...localhostAllowedOrigins(), origin]);
      if (rejected) return rejected;
      await logRpc(request);
      return createMcpHandler(() => createServer(env, origin)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

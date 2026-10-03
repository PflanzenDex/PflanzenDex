// Spike TE-15: minimaler MCP-Server als OAuth Resource Server.
// Prüft: Protected Resource Metadata (RFC 9728), Bearer-JWT (Signatur, iss, exp, aud/azp),
// Scopes je Tool und Step-up per HTTP 403 insufficient_scope. Wegwerfcode, keine Produktionsqualität.
import http from "node:http";
import fs from "node:fs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 18081);
const ISSUER = process.env.AS_ISSUER;                       // z. B. http://localhost:18080/realms/pflanzendex
const RESOURCE = process.env.RESOURCE_URL || `http://localhost:${PORT}/mcp`;
const AUD_MODE = process.env.AUD_MODE || "aud";             // "aud": aud muss RESOURCE enthalten; "azp": nur azp/client_id prüfen (Zitadel-Fall)
const SCOPES = ["pflanzen:read", "pflanzen:draft", "pflanzen:write"];
const TOOL_SCOPE = { status: "pflanzen:read", entwurf_anlegen: "pflanzen:draft", gegossen: "pflanzen:write" };
if (!ISSUER) { console.error("AS_ISSUER fehlt"); process.exit(1); }
fs.mkdirSync("logs", { recursive: true });
const log = (o) => fs.appendFileSync("logs/requests.jsonl", JSON.stringify({ t: new Date().toISOString(), ...o }) + "\n");

let jwks, meta;
async function init() {
  const base = ISSUER.replace(/\/$/, "");
  for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    const r = await fetch(base.replace(/^(https?:\/\/[^/]+)(\/.*)?$/, (_, o, path) => p.includes("oauth-authorization-server") && path ? o + p + path : base + p)).catch(() => null);
    if (r?.ok) { meta = await r.json(); break; }
  }
  if (!meta) { const r = await fetch(base + "/.well-known/openid-configuration"); meta = await r.json(); }
  jwks = createRemoteJWKSet(new URL(meta.jwks_uri));
  console.log("AS-Metadaten geladen, issuer:", meta.issuer);
}
const prmUrl = (origin) => `${origin}/.well-known/oauth-protected-resource`;
const origin = () => new URL(RESOURCE).origin;

async function authenticate(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return { error: "missing_token" };
  const token = h.slice(7);
  if (token.split(".").length !== 3) return { error: "opaque_token_unsupported" };
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: meta.issuer });
    const aud = [].concat(payload.aud || []);
    if (AUD_MODE === "aud" && !aud.includes(RESOURCE)) return { error: "invalid_audience", payload };
    const scopes = String(payload.scope || "").split(" ").filter(Boolean);
    return { ok: true, payload, scopes };
  } catch (e) { return { error: "invalid_token:" + e.code }; }
}
function server() {
  const s = new McpServer({ name: "te15-pflanzendex-spike", version: "0.0.1" });
  s.tool("status", "Liest den Tagesstatus (Klasse lesen)", {}, async () => ({ content: [{ type: "text", text: "Heute fällig: Aloe gießen (Spike-Daten)" }] }));
  s.tool("entwurf_anlegen", "Legt einen Entwurf an (Klasse Entwurf)", { text: z.string() }, async ({ text }) => ({ content: [{ type: "text", text: "Entwurf angelegt: " + text }] }));
  s.tool("gegossen", "Trägt Gießen ein (Klasse schreiben)", { exemplar: z.string() }, async ({ exemplar }) => ({ content: [{ type: "text", text: "Gegossen: " + exemplar }] }));
  return s;
}
const readBody = (req) => new Promise((res) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => res(d)); });
const send = (res, code, body, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, origin());
  if (req.method === "GET" && url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
    log({ ev: "prm", ua: req.headers["user-agent"] });
    return send(res, 200, { resource: RESOURCE, authorization_servers: [meta.issuer], scopes_supported: SCOPES, bearer_methods_supported: ["header"] });
  }
  if (req.method === "GET" && url.pathname.startsWith("/cimd/")) {   // Testhilfe: CIMD-Dokumente für Check 10; Flags im Dateinamen: unknown+jwt+claude
    const flags = url.pathname.replace("/cimd/", "").replace(".json", "").split("+");
    const doc = { client_id: `${origin()}${url.pathname}`, client_name: "Spike-Simulation", client_uri: flags.includes("claude") ? "https://claude.ai" : "https://chatgpt.com",
      redirect_uris: [flags.includes("claude") ? "https://claude.ai/api/mcp/auth_callback" : "https://chatgpt.com/connector_platform_oauth_redirect"],
      grant_types: ["authorization_code", "refresh_token", ...(flags.includes("jwt") ? ["urn:ietf:params:oauth:grant-type:jwt-bearer"] : [])], response_types: ["code"], token_endpoint_auth_method: "none",
      ...(flags.includes("unknown") ? { token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] } : {}) };
    return send(res, 200, doc, { "cache-control": "no-store" });
  }
  if (url.pathname !== new URL(RESOURCE).pathname) return send(res, 404, { error: "not_found" });
  const raw = req.method === "POST" ? await readBody(req) : "";
  let rpc; try { rpc = raw ? JSON.parse(raw) : undefined; } catch { /* ignorieren */ }
  const auth = await authenticate(req);
  const need = rpc?.method === "tools/call" ? TOOL_SCOPE[rpc.params?.name] : undefined;
  log({ ev: "mcp", method: rpc?.method, tool: rpc?.params?.name, auth: auth.ok ? "ok" : auth.error, scopes: auth.scopes, aud: auth.payload?.aud, azp: auth.payload?.azp, client_id: auth.payload?.client_id, ua: req.headers["user-agent"] });
  if (!auth.ok) return send(res, 401, { error: auth.error }, { "www-authenticate": `Bearer resource_metadata="${prmUrl(origin())}", scope="${SCOPES[0]}"` });
  if (need && !auth.scopes.includes(need)) return send(res, 403, { error: "insufficient_scope" }, { "www-authenticate": `Bearer error="insufficient_scope", scope="${need}", resource_metadata="${prmUrl(origin())}"` });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const s = server(); res.on("close", () => { transport.close(); s.close(); });
  await s.connect(transport); await transport.handleRequest(req, res, rpc);
}).listen(PORT, async () => { await init(); console.log(`MCP-Testserver auf :${PORT}, resource=${RESOURCE}, aud-mode=${AUD_MODE}`); });

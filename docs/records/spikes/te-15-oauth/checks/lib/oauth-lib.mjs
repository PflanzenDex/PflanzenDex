// Helpers for OAuth tests: PKCE, redirect listener, JWT decoding, MCP calls.
import http from "node:http";
import crypto from "node:crypto";
export const b64u = (b) => Buffer.from(b).toString("base64url");
export const pkce = () => { const v = b64u(crypto.randomBytes(32)); return { verifier: v, challenge: b64u(crypto.createHash("sha256").update(v).digest()) }; };
export const decode = (jwt) => { try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()); } catch { return null; } };
export function listener(port = 18099) {
  const buf = [], waiters = [];
  const srv = http.createServer((req, res) => { const u = new URL(req.url, `http://localhost:${port}`); res.end("ok"); if (u.pathname !== "/cb") return; const o = Object.fromEntries(u.searchParams); (waiters.shift() || ((x) => buf.push(x)))(o); }).listen(port);
  return { redirect: `http://localhost:${port}/cb`, next: (ms = 8000) => new Promise((r) => { if (buf.length) return r(buf.shift()); const t = setTimeout(() => r({ timeout: true }), ms); waiters.push((o) => { clearTimeout(t); r(o); }); }), close: () => srv.close() };
}
export async function token(meta, params) {
  const r = await fetch(meta.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; } return { status: r.status, j };
}
export async function mcp(url, bearer, method, params = {}) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { status: r.status, www: r.headers.get("www-authenticate"), body: (await r.text()).slice(0, 200) };
}
export async function discover(issuer) {
  const u = new URL(issuer);
  for (const c of [`${u.origin}/.well-known/oauth-authorization-server${u.pathname === "/" ? "" : u.pathname}`, `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`]) { const r = await fetch(c).catch(() => null); if (r?.ok) return r.json(); }
}
export async function register(meta, body) {
  const r = await fetch(meta.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

// Check 7: Ablauf gegen Zitadel v4 (DCR-Client, Auth-Code + PKCE, resource, Scopes, Token-Format, Refresh, Widerruf).
import { chromium } from "playwright";
import fs from "node:fs";
import { pkce, decode, listener, token, mcp, discover, register } from "./oauth-lib.mjs";
const ISSUER = process.env.ISSUER || "http://localhost:18082"; const RES = process.env.RESOURCE || "http://localhost:18081/mcp";
const USER = "zitadel-admin@zitadel.localhost", PASS = "Password1!";
fs.mkdirSync("out", { recursive: true });
const meta = await discover(ISSUER); const L = listener();
const reg = await register(meta, { client_name: "Spike-Client (Zitadel)", redirect_uris: [L.redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "pflanzen:read pflanzen:write offline_access" });
console.log("DCR:", reg.status, reg.j.client_id, "| scope im Response:", reg.j.scope); const cid = reg.j.client_id;
const browser = await chromium.launch(); const ctx = await browser.newContext({ locale: "de-DE" });
async function authorize(scope, resource, tag) {
  const p = pkce(); const state = Math.random().toString(36).slice(2);
  const q = new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: L.redirect, scope, state, code_challenge: p.challenge, code_challenge_method: "S256", ...(resource ? { resource } : {}) });
  const page = await ctx.newPage(); await page.goto(`${meta.authorization_endpoint}?${q}`);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200); const u = page.url();
    if (u.startsWith("http://localhost:18099")) break;
    if (await page.locator('input[type="password"]:visible').count()) { await page.fill('input[type="password"]:visible', PASS); await page.locator('button[type=submit]:visible').first().click(); continue; }
    if (await page.locator('input[name="loginName"]:visible').count()) { await page.fill('input[name="loginName"]:visible', USER); await page.locator('button[type=submit]', { hasText: "Weiter" }).click(); continue; }
    const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300);
    await page.screenshot({ path: `out/${tag}-step${i}.png`, fullPage: true });
    console.log(`  Schritt ${i}: ${u.slice(0, 100)} | ${txt}`);
    const btn = page.locator('button[type=submit]:has-text("Zulassen"), button[type=submit]:has-text("Akzeptieren"), button:has-text("Weiter")'); if (await btn.count()) await btn.first().click();
  }
  const res = await L.next(); if (res.timeout) { res.url = page.url(); await page.screenshot({ path: `out/${tag}-9-timeout.png`, fullPage: true }); }
  await page.close(); return { res, verifier: p.verifier, state };
}
const exchange = (a, resource) => a.res.code ? token(meta, { grant_type: "authorization_code", code: a.res.code, redirect_uri: L.redirect, client_id: cid, code_verifier: a.verifier, ...(resource ? { resource } : {}) }) : Promise.resolve({ j: {}, error: a.res });
const show = (t) => { const at = t.j?.access_token || ""; const d = decode(at); return d ? { format: "JWT", aud: d.aud, scope: d.scope, azp: d.azp, client_id: d.client_id, iss: d.iss, exp_in: d.exp - d.iat } : { format: at ? "opak/verschlüsselt" : "kein Token", len: at.length, scope_response: t.j?.scope, err: t.error || t.j?.error }; };
console.log("\n[A] resource + Scope pflanzen:read");
let a = await authorize("openid offline_access pflanzen:read", RES, "ZA"); console.log("  Redirect-Parameter:", JSON.stringify({ ...a.res, code: a.res.code ? "…" : undefined }));
let t = await exchange(a, RES); console.log("  Token:", JSON.stringify(show(t))); console.log("  Token-Antwort-Felder:", Object.keys(t.j || {}).join(","), "| scope:", t.j?.scope);
const refresh = t.j?.refresh_token; const at = t.j?.access_token;
if (at && fs.existsSync("../zitadel/secrets/admin.pat")) {
  const pat = fs.readFileSync("../zitadel/secrets/admin.pat", "utf8").trim();
  const ir = await fetch(meta.introspection_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Bearer ${pat}` }, body: new URLSearchParams({ token: at }) });
  const ij = await ir.json().catch(() => ({})); console.log("  Introspektion (mit Service-User-PAT) ->", ir.status, JSON.stringify({ active: ij.active, scope: ij.scope, aud: ij.aud, client_id: ij.client_id, azp: ij.azp, sub: ij.sub?.slice(0, 8) }));
}
let r1 = await mcp(RES, at, "tools/call", { name: "status", arguments: {} }); console.log("  MCP (aud-Modus)   ->", r1.status, r1.body.slice(0, 70));
console.log("\n[B] falsche resource");
a = await authorize("openid pflanzen:read", "http://localhost:9999/falsch", "ZB"); t = await exchange(a, "http://localhost:9999/falsch"); console.log("  ->", JSON.stringify(show(t)));
console.log("\n[C] Refresh und Widerruf");
if (refresh) {
  const rf = await token(meta, { grant_type: "refresh_token", refresh_token: refresh, client_id: cid }); console.log("  Refresh           ->", rf.status, "neues Refresh-Token verschieden:", rf.j.refresh_token && rf.j.refresh_token !== refresh);
  const rv = await fetch(meta.revocation_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: rf.j.refresh_token || refresh, client_id: cid, token_type_hint: "refresh_token" }) }); console.log("  Revoke            ->", rv.status);
  const rf2 = await token(meta, { grant_type: "refresh_token", refresh_token: rf.j.refresh_token || refresh, client_id: cid }); console.log("  Refresh nach Revoke ->", rf2.status, rf2.j.error);
}
await browser.close(); L.close();

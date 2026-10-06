// Check 4: full flow against Keycloak (DCR client, auth code + PKCE, resource, consent, step-up, refresh, revocation).
import { chromium } from "playwright";
import fs from "node:fs";
const ALICE = (() => { try { return JSON.parse(fs.readFileSync(new URL("./secrets/kc.json", import.meta.url))).alice; } catch { return "alice"; } })();
import { pkce, decode, listener, token, mcp, discover, register } from "./oauth-lib.mjs";
const ISSUER = process.env.ISSUER || "http://localhost:18080/realms/pflanzendex";
const RES = process.env.RESOURCE || "http://localhost:18081/mcp";
fs.mkdirSync("out", { recursive: true });
const meta = await discover(ISSUER); const L = listener();
const reg = await register(meta, { client_name: "Spike client (Claude-like)", redirect_uris: [L.redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: "pflanzen:read pflanzen:draft pflanzen:write offline_access" });
console.log("DCR:", reg.status, reg.j.client_id); const cid = reg.j.client_id;
const browser = await chromium.launch(); const ctx = await browser.newContext({ locale: "de-DE" });
async function authorize(scope, resource, tag) {
  const p = pkce(); const state = Math.random().toString(36).slice(2);
  const q = new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: L.redirect, scope, state, code_challenge: p.challenge, code_challenge_method: "S256", ...(resource ? { resource } : {}) });
  const page = await ctx.newPage();
  await page.goto(`${meta.authorization_endpoint}?${q}`);
  if (await page.locator("#username").count()) { await page.screenshot({ path: `out/${tag}-1-login.png` }); await page.fill("#username", "alice"); await page.fill("#password", ALICE); await page.click("#kc-login"); }
  const consent = page.locator('[name="accept"]');
  await consent.first().waitFor({ timeout: 6000 }).catch(async () => { console.log("  DEBUG Buttons:", await page.locator("button, input[type=submit], input[type=checkbox]").evaluateAll((e) => e.map((x) => x.outerHTML.slice(0, 140)))); });
  if (await consent.count()) { console.log('  Consent erkannt');
    await page.screenshot({ path: `out/${tag}-2-consent.png`, fullPage: true });
    const boxes = await page.locator("input[type=checkbox]").count();
    console.log(`  Consent-Screen: ${boxes} checkbox(es) (deselectable scopes), text:`, (await page.locator("#kc-oauth, .content-area, body").first().innerText()).replace(/\s+/g, " ").slice(0, 330));
    await consent.first().click();
  } else console.log("  kein Consent-Screen");
  const res = await L.next(); if (res.timeout) { res.url = page.url(); await page.screenshot({ path: `out/${tag}-9-timeout.png`, fullPage: true }); res.title = await page.title(); res.text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300); }
  await page.close(); return { res, verifier: p.verifier, state };
}
async function exchange(a, resource) {
  if (!a.res.code) return { error: a.res }; 
  return token(meta, { grant_type: "authorization_code", code: a.res.code, redirect_uri: L.redirect, client_id: cid, code_verifier: a.verifier, ...(resource ? { resource } : {}) });
}
const show = (t) => { const d = decode(t.j?.access_token || ""); return d ? { aud: d.aud, scope: d.scope, azp: d.azp, iss: d.iss, exp_in: d.exp - d.iat } : t; };
console.log("\n[A] Nur lesen, korrekte resource");
let a = await authorize("pflanzen:read", RES, "A"); console.log("  iss-Parameter im Redirect:", a.res.iss, "| state ok:", a.res.state === a.state);
let t = await exchange(a, RES); console.log("  Token:", JSON.stringify(show(t))); const tokRead = t.j.access_token; const refresh = t.j.refresh_token;
let r1 = await mcp(RES, tokRead, "tools/call", { name: "status", arguments: {} }); console.log("  MCP status        ->", r1.status, r1.body.slice(0, 80));
let r2 = await mcp(RES, tokRead, "tools/call", { name: "watered", arguments: { specimen: "Aloe" } }); console.log("  MCP watered      ->", r2.status, r2.www);
console.log("\n[B] Step-up: lesen + schreiben");
a = await authorize("pflanzen:read pflanzen:write", RES, "B"); t = await exchange(a, RES); console.log("  Token:", JSON.stringify(show(t)));
let r3 = await mcp(RES, t.j.access_token, "tools/call", { name: "watered", arguments: { specimen: "Aloe" } }); console.log("  MCP watered      ->", r3.status, r3.body.slice(0, 80));
console.log("\n[C] resource-Verhalten");
a = await authorize("pflanzen:read", "http://localhost:9999/falsch", "C1"); t = await exchange(a, "http://localhost:9999/falsch"); console.log("  falsche resource  ->", a.res.error || t.status, JSON.stringify(t.j.error ? t.j : show(t)).slice(0, 200));
a = await authorize("pflanzen:read", null, "C2"); t = await exchange(a, null); console.log("  without resource  ->", JSON.stringify(show(t)));
console.log("\n[D] Refresh and revocation");
if (refresh) {
  const rf = await token(meta, { grant_type: "refresh_token", refresh_token: refresh, client_id: cid, resource: RES }); console.log("  Refresh           ->", rf.status, "neues Refresh-Token verschieden:", rf.j.refresh_token && rf.j.refresh_token !== refresh, JSON.stringify(show(rf)));
  const rv = await fetch(meta.revocation_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: rf.j.refresh_token || refresh, client_id: cid, token_type_hint: "refresh_token" }) });
  console.log("  Revoke            ->", rv.status);
  const rf2 = await token(meta, { grant_type: "refresh_token", refresh_token: rf.j.refresh_token || refresh, client_id: cid }); console.log("  Refresh nach Revoke ->", rf2.status, rf2.j.error);
}
await browser.close(); L.close();

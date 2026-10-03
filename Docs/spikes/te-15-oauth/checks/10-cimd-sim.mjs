// Check 10: does Keycloak accept a URL client ID (CIMD)? Variant with and without the field typical for ChatGPT.
import { chromium } from "playwright";
import { discover, pkce } from "./oauth-lib.mjs";
const ISSUER = process.env.ISSUER, MCP = process.env.MCP_ORIGIN; const meta = await discover(ISSUER);
console.log("client_id_metadata_document_supported:", meta.client_id_metadata_document_supported);
const b = await chromium.launch();
for (const v of (process.env.VARIANTS || "without-unknown,with-unknown,claude-like").split(",")) {
  const cid = `${MCP}/cimd/${v}.json`; const doc = await (await fetch(cid)).json();
  const p = pkce(); const q = new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: doc.redirect_uris[0], scope: "pflanzen:read", state: "s", code_challenge: p.challenge, code_challenge_method: "S256", resource: `${MCP}/mcp` });
  const page = await (await b.newContext({ locale: "de-DE" })).newPage(); const r = await page.goto(`${meta.authorization_endpoint}?${q}`); await page.waitForLoadState("networkidle");
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200);
  const ok = await page.locator("#username").count();
  console.log(`CIMD [${v}] -> HTTP ${r.status()} | ${ok ? "Login-Seite erreicht (Dokument akzeptiert)" : "FEHLER: " + text} | URL ${page.url().slice(0, 90)}`);
  await page.screenshot({ path: `out/cimd-${v}.png` });
}
await b.close();

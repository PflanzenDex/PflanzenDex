// Exploration: DCR with a foreign domain, then the login page of Zitadel v4 (fields).
import { chromium } from "playwright";
import { discover, register, pkce } from "./oauth-lib.mjs";
const meta = await discover("http://localhost:18082");
const evil = await register(meta, { client_name: "Fremder Client", redirect_uris: ["https://evil.example.org/cb"], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" });
console.log("DCR fremde Domain ->", evil.status, evil.j.client_id ? "akzeptiert" : JSON.stringify(evil.j));
const http_ = await register(meta, { client_name: "HTTP-Client", redirect_uris: ["http://evil.example.org/cb"], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" });
console.log("DCR http + fremde Domain ->", http_.status, http_.j.client_id ? "akzeptiert" : JSON.stringify(http_.j));
const reg = await register(meta, { client_name: "Explorer", redirect_uris: ["http://localhost:18099/cb"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
const p = pkce();
const q = new URLSearchParams({ response_type: "code", client_id: reg.j.client_id, redirect_uri: "http://localhost:18099/cb", scope: "openid pflanzen:read", state: "x", code_challenge: p.challenge, code_challenge_method: "S256", resource: "http://localhost:18081/mcp" });
const b = await chromium.launch(); const page = await (await b.newContext({ locale: "de-DE" })).newPage();
await page.goto(`${meta.authorization_endpoint}?${q}`); await page.waitForLoadState("networkidle");
console.log("URL:", page.url().slice(0, 140)); console.log("Titel:", await page.title());
console.log("Inputs:", await page.locator("input, button").evaluateAll((e) => e.map((x) => `${x.tagName} name=${x.name} id=${x.id} type=${x.type} text=${(x.innerText || "").slice(0, 20)}`)));
await page.screenshot({ path: "out/Z-0-login.png" }); await b.close();

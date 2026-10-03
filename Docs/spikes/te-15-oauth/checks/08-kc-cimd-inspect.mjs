import { KC } from "./kc-lib.mjs";
const t = (await (await fetch(`${KC}/realms/master/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: "admin", password: "admin" }) })).json()).access_token;
const info = await (await fetch(`${KC}/admin/serverinfo`, { headers: { authorization: `Bearer ${t}` } })).json();
const ex = info.providers["client-policy-executor"].providers; console.log("Executor:", Object.keys(ex).filter((k) => /metadata|resource/.test(k)));
const cond = info.providers["client-policy-condition"].providers; console.log("Conditions:", Object.keys(cond).filter((k) => /uri|metadata|id/.test(k)));
console.log(JSON.stringify(ex["client-id-metadata-document"]).slice(0, 1500));
console.log(JSON.stringify(cond["client-id-uri"]).slice(0, 800));

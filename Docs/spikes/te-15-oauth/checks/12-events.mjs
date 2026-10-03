// Auswertung nach Tests mit echten Clients: Keycloak-Ereignisse und MCP-Anfragen.
import fs from "node:fs";
import { admin } from "./kc-lib.mjs";
const n = Number(process.argv[2] || 40);
const ev = await admin(`/events?max=${n}`);
console.log(`Keycloak-Ereignisse (neueste ${ev.length}):`);
for (const e of ev.reverse()) console.log(" ", new Date(e.time).toISOString().slice(11, 19), (e.type || "").padEnd(22), "client:", String(e.clientId || "-").slice(0, 60).padEnd(60), e.error ? "FEHLER " + e.error : "", e.details?.scope ? "scope=" + e.details.scope : "", e.details?.reason || "");
const log = "../mcp-test-server/logs/requests.jsonl";
if (fs.existsSync(log)) { const L = fs.readFileSync(log, "utf8").trim().split("\n").slice(-n).map(JSON.parse); console.log(`\nMCP-Anfragen (neueste ${L.length}):`); for (const r of L) console.log(" ", r.t.slice(11, 19), (r.ev || "").padEnd(4), String(r.method || "").padEnd(18), String(r.tool || "").padEnd(16), r.auth, r.scopes ? "scopes=" + r.scopes.join(",") : "", "ua=" + String(r.ua || "").slice(0, 40)); }

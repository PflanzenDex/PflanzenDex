// Registriert den MCP-Server als Ressource (Client mit Attribut resource_url, Feature resource-indicators).
import { admin } from "./kc-lib.mjs";
const url = process.argv[2] || "http://localhost:18081/mcp";
await admin("/clients", { method: "POST", body: { clientId: "pflanzendex-mcp", name: "PflanzenDex MCP (Ressource)", enabled: true, bearerOnly: false, publicClient: false, standardFlowEnabled: false, attributes: { resource_url: url } } });
const c = (await admin("/clients?clientId=pflanzendex-mcp"))[0];
c.attributes = { ...c.attributes, resource_url: url }; await admin(`/clients/${c.id}`, { method: "PUT", body: c });
console.log("Ressource registriert:", c.clientId, JSON.stringify((await admin(`/clients/${c.id}`)).attributes));

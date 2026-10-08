// Audience mapper on the pflanzen:* scopes so that the MCP server appears as a possible audience in the token;
// Keycloak (resource-indicators) engt sie dann anhand des resource-Parameters ein.
import { admin } from "../lib/kc-lib.mjs";
for (const s of (await admin("/client-scopes")).filter((s) => s.name.startsWith("pflanzen:"))) {
  await admin(`/client-scopes/${s.id}/protocol-mappers/models`, { method: "POST", body: { name: "aud-mcp", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", config: { "included.client.audience": "pflanzendex-mcp", "id.token.claim": "false", "access.token.claim": "true", "introspection.token.claim": "true" } } });
  console.log("Mapper gesetzt an", s.name);
}

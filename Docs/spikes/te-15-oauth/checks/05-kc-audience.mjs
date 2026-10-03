// Audience-Mapper an den pflanzen:*-Scopes, damit der MCP-Server als mögliche Audience im Token steht;
// Keycloak (resource-indicators) engt sie dann anhand des resource-Parameters ein.
import { admin } from "./kc-lib.mjs";
for (const s of (await admin("/client-scopes")).filter((s) => s.name.startsWith("pflanzen:"))) {
  await admin(`/client-scopes/${s.id}/protocol-mappers/models`, { method: "POST", body: { name: "aud-mcp", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", config: { "included.client.audience": "pflanzendex-mcp", "id.token.claim": "false", "access.token.claim": "true", "introspection.token.claim": "true" } } });
  console.log("Mapper gesetzt an", s.name);
}

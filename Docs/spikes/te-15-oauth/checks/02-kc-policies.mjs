// Sets the anonymous DCR policies the way a production operation would need them:
// registration only if the redirect URIs are on trusted domains (instead of a host check of the sender IP).
import { admin } from "./kc-lib.mjs";
const comps = await admin("/components?type=org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy");
const th = comps.find((c) => c.name === "Trusted Hosts" && c.subType === "anonymous");
th.config = { "host-sending-registration-request-must-match": ["false"], "client-uris-must-match": ["true"], "trusted-hosts": ["claude.ai", "chatgpt.com", "localhost", "127.0.0.1"] };
await admin(`/components/${th.id}`, { method: "PUT", body: th });
const acs = comps.find((c) => c.name === "Allowed Client Scopes" && c.subType === "anonymous");
acs.config = { "allow-default-scopes": ["true"], "allowed-client-scopes": ["pflanzen:read", "pflanzen:draft", "pflanzen:write", "offline_access"] };
await admin(`/components/${acs.id}`, { method: "PUT", body: acs });
console.log("Policies gesetzt: Trusted Hosts (client-uris-must-match, Domains claude.ai/chatgpt.com/localhost), Allowed Client Scopes");

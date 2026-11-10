// Target state of the realm `pflanzendex` for the MCP endpoint (US-KI-07, TE-16; spike TE-15 findings 1 to 6) and the
// comparison the steps use to stay idempotent. Used by steps.mjs; no dependencies.

export const RESOURCE_CLIENT_ID = "pflanzendex-mcp";
export const DCR_POLICY_TYPE =
  "org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy";

// Rights of an AI client (US-KI-07): read, drafts, reversible changes. The texts show on the consent page.
export const SCOPES = {
  "pflanzen:read": "Read plant data",
  "pflanzen:draft": "Create drafts",
  "pflanzen:write": "Write reversible changes",
};
// Anonymous client registration (DCR): which scopes a client may ask for, and from which redirect hosts.
export const ALLOWED_SCOPES = [...Object.keys(SCOPES), "offline_access"];
export const TRUSTED_HOSTS = ["claude.ai", "chatgpt.com", "localhost", "127.0.0.1"];

export const scopeOf = ([name, text]) => ({
  name,
  description: text,
  protocol: "openid-connect",
  attributes: {
    "include.in.token.scope": "true",
    "display.on.consent.screen": "true",
    "consent.screen.text": text,
  },
});

// Puts the resource URL itself into `aud`, the audience the MCP endpoint checks (RFC 8707). A client audience
// (`included.client.audience`, the spike's mapper) gives `aud: pflanzendex-mcp` whenever the client omits the `resource`
// parameter, as Claude Code does (TE-16, 2026-11-02); the API refuses that token (`invalid_token`).
export const AUDIENCE_MAPPER_NAME = "aud-mcp";
export const audienceMapperOf = (resourceUrl) => ({
  name: AUDIENCE_MAPPER_NAME,
  protocol: "openid-connect",
  protocolMapper: "oidc-audience-mapper",
  config: {
    "included.custom.audience": resourceUrl,
    "id.token.claim": "false",
    "access.token.claim": "true",
    "introspection.token.claim": "true",
  },
});
// A mapper with this key still adds the client id to `aud`; the steps remove it.
export const CLIENT_AUDIENCE_KEY = "included.client.audience";

export const resourceClientOf = (resourceUrl) => ({
  clientId: RESOURCE_CLIENT_ID,
  name: "PflanzenDéx MCP (resource)",
  enabled: true,
  publicClient: false,
  bearerOnly: false,
  standardFlowEnabled: false,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
  attributes: { resource_url: resourceUrl },
});

export const DCR_POLICIES = [
  {
    name: "Trusted Hosts",
    providerId: "trusted-hosts",
    subType: "anonymous",
    config: {
      "host-sending-registration-request-must-match": ["false"],
      "client-uris-must-match": ["true"],
      "trusted-hosts": TRUSTED_HOSTS,
    },
  },
  {
    name: "Allowed Client Scopes",
    providerId: "allowed-client-templates",
    subType: "anonymous",
    config: { "allow-default-scopes": ["true"], "allowed-client-scopes": ALLOWED_SCOPES },
  },
];

// PKCE with S256 only, for every client of the realm (finding 5).
export const PKCE_PROFILE = {
  name: "pkce-s256",
  description: "PKCE with S256 only (US-KI-07, TE-15 finding 5)",
  executors: [{ executor: "pkce-enforcer", configuration: { "auto-configure": "true" } }],
};
export const PKCE_POLICY = {
  name: "pkce-s256-all-clients",
  description: "Every client of the realm uses PKCE with S256",
  enabled: true,
  conditions: [{ condition: "any-client", configuration: {} }],
  profiles: [PKCE_PROFILE.name],
};

/** True when every key of `want` has the same value in `have` (arrays compared as sets, objects recursively). */
export function covers(have, want) {
  if (Array.isArray(want)) {
    if (!Array.isArray(have) || have.length !== want.length) return false;
    const a = have.map((x) => JSON.stringify(x)).sort();
    const b = want.map((x) => JSON.stringify(x)).sort();
    return a.every((x, i) => x === b[i]);
  }
  if (want && typeof want === "object") {
    if (!have || typeof have !== "object") return false;
    return Object.entries(want).every(([k, v]) => covers(have[k], v));
  }
  return have === want;
}

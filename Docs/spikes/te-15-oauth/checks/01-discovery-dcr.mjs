// Check 1: Discovery metadata (RFC 8414 / OIDC) and anonymous Dynamic Client Registration (RFC 7591).
// Usage: node 01-discovery-dcr.mjs <issuer>
const issuer = process.argv[2];
const u = new URL(issuer);
const cands = [
  `${u.origin}/.well-known/oauth-authorization-server${u.pathname === "/" ? "" : u.pathname}`,
  `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
  `${u.origin}/.well-known/openid-configuration${u.pathname === "/" ? "" : u.pathname}`,
];
let meta;
for (const c of cands) {
  const r = await fetch(c).catch(() => null);
  console.log(r?.ok ? "OK  " : "missing", c);
  if (r?.ok && !meta) meta = await r.json();
}
const keys = [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
  "registration_endpoint",
  "revocation_endpoint",
  "introspection_endpoint",
  "jwks_uri",
  "scopes_supported",
  "code_challenge_methods_supported",
  "token_endpoint_auth_methods_supported",
  "grant_types_supported",
  "client_id_metadata_document_supported",
  "authorization_response_iss_parameter_supported",
  "resource_indicators_supported",
];
console.log("\nMetadata:");
for (const k of keys) console.log(" ", k.padEnd(48), JSON.stringify(meta?.[k]));
if (!meta?.registration_endpoint) {
  console.log("\nNO registration_endpoint -> DCR not advertised");
  process.exit(0);
}
const reg = async (label, body) => {
  const r = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  console.log(`\nDCR [${label}] -> ${r.status}`);
  console.log("  ", JSON.stringify(j).slice(0, 420));
  return { status: r.status, j };
};
const scope = "pflanzen:read pflanzen:draft pflanzen:write";
await reg("Claude-like", {
  client_name: "Claude (Spike-Test)",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  scope,
});
await reg("ChatGPT-like", {
  client_name: "ChatGPT (Spike-Test)",
  redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_methods_supported: ["none"],
  scope,
});

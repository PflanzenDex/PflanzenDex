// MCP readiness of the realm `pflanzendex` (US-KI-07, FR-KI-06, TE-16; spike TE-15 findings 1 to 6), idempotently: the
// target state is in target-state.mjs, the steps in steps.mjs; this file signs in, runs them and checks the discovery.
//
// Runs inside the compose network as the one-shot service `keycloak-mcp` (docker-compose.yml, profile `setup`):
// deploy.sh starts it after Keycloak is healthy, an operator with `docker compose run --rm keycloak-mcp`. It signs in to
// the master realm with the credentials the service gets from `.env` (never from the command line) and prints names and
// counts only, never a password, token or client secret. Exit 0 = ready, 1 = failed (P-10).
//
// Env: KC_URL (default http://keycloak:8080), KC_ADMIN_USER, KC_ADMIN_PASSWORD (compose: KEYCLOAK_SETUP_* if set, else
// the bootstrap admin KEYCLOAK_ADMIN_*), AI_RESOURCE_URL (`${APP_URL}/api/mcp`).
// No dependencies: plain Node, so it runs in the pinned node image with this folder mounted read-only.
import { pathToFileURL } from "node:url";

import { setupMcpRealm } from "./steps.mjs";
import { SCOPES } from "./target-state.mjs";

export const REALM = "pflanzendex";

/**
 * Checks the discovery document of the realm: the features `cimd` and `resource-indicators` are on and the scopes are
 * announced. Returns the problems found (empty = fine). `code_challenge_methods_supported` is not checked: Keycloak
 * 26.8 announces `plain` there although the client policy refuses it (checked locally on 2026-11-02).
 */
export function checkDiscovery(doc) {
  const problems = [];
  if (doc.client_id_metadata_document_supported !== true) {
    problems.push("client_id_metadata_document_supported is not true (KC_FEATURES lacks cimd)");
  }
  const missing = Object.keys(SCOPES).filter((s) => !(doc.scopes_supported ?? []).includes(s));
  if (missing.length) problems.push(`scopes_supported lacks ${missing.join(", ")}`);
  return problems;
}

/** Admin API client for one realm, signed in as a master realm user (password grant of `admin-cli`). */
export async function adminClient({ baseUrl, user, password, realm = REALM, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: user,
      password,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `the admin "${user}" cannot sign in to the master realm (HTTP ${res.status}); check KEYCLOAK_SETUP_USER/` +
        "KEYCLOAK_SETUP_PASSWORD (after the admin handover) or KEYCLOAK_ADMIN_* in .env (runbook: AI access: the MCP endpoint)",
    );
  }
  const { access_token: token } = await res.json();
  const call = async (method, path, body) => {
    const r = await fetchImpl(`${baseUrl}/admin/realms/${realm}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : undefined;
  };
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    put: (path, body) => call("PUT", path, body),
  };
}

async function main(env = process.env) {
  const baseUrl = (env.KC_URL || "http://keycloak:8080").replace(/\/$/, "");
  if (!env.KC_ADMIN_PASSWORD)
    throw new Error("KC_ADMIN_PASSWORD is missing (KEYCLOAK_ADMIN_PASSWORD in .env)");
  const kc = await adminClient({
    baseUrl,
    user: env.KC_ADMIN_USER || "admin",
    password: env.KC_ADMIN_PASSWORD,
  });
  const changes = await setupMcpRealm(kc, { resourceUrl: env.AI_RESOURCE_URL });
  for (const change of changes) console.log(`mcp realm: ${change}`);
  const res = await fetch(`${baseUrl}/realms/${REALM}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`discovery of the realm answered HTTP ${res.status}`);
  const problems = checkDiscovery(await res.json());
  if (problems.length) throw new Error(problems.join("; "));
  console.log(
    changes.length
      ? `mcp realm: ready (${changes.length} changes)`
      : "mcp realm: ready (no change)",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ERROR: mcp realm setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

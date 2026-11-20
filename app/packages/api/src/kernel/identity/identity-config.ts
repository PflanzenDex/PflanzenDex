import { identityKept, type IdentityRemoval } from "@pflanzendex/core";
import { keycloakIdentityRemoval } from "./keycloak-identity";

// The sign-in service's admin interface (US-ACC-04, issue 1673; US-ACC-01, issue 2065): one service client serves the
// removal of a deleted keeper's user and "Auf allen Geräten abmelden" (the logout of its sessions). It needs only the realm
// role `manage-users` of `realm-management`, which covers both, and no other role. Four variables, all or none; the values
// never leave the process (no log line, no answer, no database row).
const NAMES = [
  "IDENTITY_ADMIN_URL",
  "IDENTITY_TOKEN_URL",
  "IDENTITY_ADMIN_CLIENT_ID",
  "IDENTITY_ADMIN_CLIENT_SECRET",
] as const;

export interface IdentityAdminConfig {
  /** The realm's admin base, e.g. `http://keycloak:8080/admin/realms/pflanzendex`. */
  readonly adminUrl: string;
  /** The token endpoint of the realm, for the client credentials grant. */
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

const isUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * `null` when none of the variables is set (the removal stays manual, quietly); the names of the missing or invalid ones
 * when only some are set; the configuration when all are set. Only names come back, never a value.
 */
export function identityAdminConfigFromEnv(
  env: NodeJS.ProcessEnv,
): IdentityAdminConfig | null | string[] {
  const values = Object.fromEntries(NAMES.map((name) => [name, (env[name] ?? "").trim()]));
  if (NAMES.every((name) => values[name] === "")) return null;
  const bad = NAMES.filter(
    (name) => values[name] === "" || (name.endsWith("_URL") && !isUrl(values[name] ?? "")),
  );
  if (bad.length > 0) return bad;
  return {
    adminUrl: values.IDENTITY_ADMIN_URL ?? "",
    tokenUrl: values.IDENTITY_TOKEN_URL ?? "",
    clientId: values.IDENTITY_ADMIN_CLIENT_ID ?? "",
    clientSecret: values.IDENTITY_ADMIN_CLIENT_SECRET ?? "",
  };
}

/**
 * The identity settings the server reads once at start: the configuration when all four variables are set, `null` otherwise.
 * A partial set is named in the log by its variables only, once for both features; the API still starts with `null`.
 */
export function identityConfigFromEnv(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
): IdentityAdminConfig | null {
  const config = identityAdminConfigFromEnv(env);
  if (Array.isArray(config)) {
    log(
      `Identity settings are partial, missing or invalid: ${config.join(", ")}. The removal of users stays manual and "sign out on all devices" is unavailable.`,
    );
    return null;
  }
  return config;
}

/**
 * The removal the server composes: the sign-in service's admin interface when configured; otherwise the stub `identityKept`,
 * which keeps the subject open for the operator (P-10).
 */
export function identityRemovalFor(
  config: IdentityAdminConfig | null,
  fetchFn?: typeof fetch,
): IdentityRemoval {
  return config === null ? identityKept : keycloakIdentityRemoval(config, fetchFn);
}

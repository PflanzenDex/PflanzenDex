import { identityKept, type IdentityRemoval } from "@pflanzendex/core";
import { keycloakIdentityRemoval } from "./keycloak-identity";

// The identity removal (US-ACC-04, issue 1673): the sign-in service's admin interface, through a service client that may
// only delete users (realm role `manage-users` of `realm-management`, nothing else). Four variables, all or none; the
// values never leave the process (no log line, no answer, no database row).
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
 * The removal the server composes: the sign-in service's admin interface when configured; otherwise the stub, which keeps
 * the subject open for the operator (P-10). A partial configuration is named in the log and keeps the stub, so the API
 * still starts.
 */
export function identityRemovalFromEnv(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
  fetchFn?: typeof fetch,
): IdentityRemoval {
  const config = identityAdminConfigFromEnv(env);
  if (config === null) return identityKept;
  if (Array.isArray(config)) {
    log(
      `Identity removal is manual (the operator marks it in the operator area), missing or invalid: ${config.join(", ")}.`,
    );
    return identityKept;
  }
  return keycloakIdentityRemoval(config, fetchFn);
}

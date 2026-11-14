import {
  appError,
  failed,
  ok,
  sessionsNotConfigured,
  type IdentitySessions,
} from "@pflanzendex/core";
import { adminRequest, identityAdminConfigFromEnv, type IdentityAdminConfig } from "../../kernel";

// Ends a keeper's sessions at the sign-in service (US-ACC-01, issue 2065; the admin client is in kernel/identity): `POST <admin base>/users/<subject>/logout` with
// the client credentials token of the identity service client, the same client as the identity removal (realm role
// manage-users of realm-management, nothing else). Nothing is read back and no realm is changed.

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/**
 * `ended` when the service answers 204 or 200, and when the user is already gone (404: no session is left to end, so
 * repeating is harmless). Every other answer and every failure to reach the service is the error
 * `account.sign_out_everywhere_failed`; the reason goes to the log, never a secret and never the subject.
 */
export function keycloakSessionsEnding(
  config: IdentityAdminConfig,
  fetchFn: typeof fetch = fetch,
  log: (line: string) => void = console.warn,
): IdentitySessions {
  const fail = (cause: unknown) => {
    log(`Sign-out on all devices failed at the sign-in service: ${reason(cause)}.`);
    return failed(appError("account.sign_out_everywhere_failed", { cause }));
  };
  return {
    async endAll(subject) {
      try {
        const r = await adminRequest(
          config,
          fetchFn,
          "POST",
          `/users/${encodeURIComponent(subject)}/logout`,
        );
        if (r.status === 204 || r.status === 200 || r.status === 404) return ok("ended");
        return fail(new Error(`logout answered ${r.status}`));
      } catch (cause) {
        return fail(cause);
      }
    },
  };
}

/**
 * The sessions port the server composes (US-ACC-01): the sign-in service's admin interface when the four identity variables
 * are all set; otherwise the stub `sessionsNotConfigured`, which answers unavailable. A partial set is named in the log by
 * its variables only, and the API still starts.
 */
export function identitySessionsFromEnv(
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
  fetchFn?: typeof fetch,
): IdentitySessions {
  const config = identityAdminConfigFromEnv(env);
  if (config === null) return sessionsNotConfigured;
  if (Array.isArray(config)) {
    log(`Sign-out on all devices is unavailable, missing or invalid: ${config.join(", ")}.`);
    return sessionsNotConfigured;
  }
  return keycloakSessionsEnding(config, fetchFn, log);
}

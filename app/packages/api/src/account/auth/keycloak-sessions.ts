import {
  appError,
  failed,
  ok,
  sessionsNotConfigured,
  type IdentitySessions,
} from "@pflanzendex/core";
import { adminRequest, type IdentityAdminConfig } from "../../kernel";

// Ends a keeper's sessions at the sign-in service (US-ACC-01, issue 2065): `POST <admin base>/users/<subject>/logout` with
// the client credentials token of the identity service client (the same client as the identity removal; the realm role
// manage-users of realm-management covers logout). Nothing is read back and no realm is changed.

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/**
 * `ended` when the service answers 204 or 200. Every other answer is a failure, 404 too: the token was just accepted, so a
 * missing user means a wrong realm or subject, not an empty session list. An unreachable service or a refused token is a
 * failure as well. Each failure is `account.sign_out_everywhere_failed`, and the reason goes to the log: never a secret and
 * never the subject.
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
        if (r.status === 204 || r.status === 200) return ok("ended");
        return fail(new Error(`logout answered ${r.status}`));
      } catch (cause) {
        return fail(cause);
      }
    },
  };
}

/**
 * The sessions port the server composes (US-ACC-01) from the identity settings read once at start (`identityConfigFromEnv`):
 * the sign-in service's admin interface when they are set; otherwise the stub `sessionsNotConfigured`, which answers unavailable.
 */
export function identitySessionsFor(
  config: IdentityAdminConfig | null,
  log: (line: string) => void = console.warn,
  fetchFn?: typeof fetch,
): IdentitySessions {
  return config === null ? sessionsNotConfigured : keycloakSessionsEnding(config, fetchFn, log);
}

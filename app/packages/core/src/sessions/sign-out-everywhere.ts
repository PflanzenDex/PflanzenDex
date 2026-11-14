import { appError, defineOperation, failed, ok, shape, textField, type Result } from "../kernel";

// Sign out on all devices (US-ACC-01, issue 2065): the API ends every session of the keeper at the sign-in service. The
// operation carries no domain data; the sign-in service is a port (AB-1), its adapter lives in the api. The browser never
// calls the sign-in service's account API, because its token has no right there and its refusal carries no CORS header.

/**
 * Port of the sign-in service's sessions: ends every session of one subject there. `ended` when none is left (also when
 * none was there). `not_configured` when this server is not set up for the service (the stub `sessionsNotConfigured`).
 * A failure is an error result, and nothing counts as ended (P-10).
 */
export interface IdentitySessions {
  endAll(subject: string): Promise<Result<"ended" | "not_configured">>;
}

/** The stub while the sign-in service is not configured on this server: nothing is ended, and the answer says so. */
export const sessionsNotConfigured: IdentitySessions = {
  endAll: async () => ok("not_configured"),
};

export interface SignOutDependencies {
  readonly identity: IdentitySessions;
}

// The subject comes from the verified token of the caller (the route), never from the request body.
const subjectInput = shape({ subject: textField("subject", { min: 1, max: 255 }) });

/** Ends every session of the keeper's own subject (`account.sign_out_everywhere`). Not released to AI connections. */
export const signOutEverywhere = (deps: SignOutDependencies) =>
  defineOperation({
    name: "account.sign_out_everywhere",
    schema: subjectInput,
    run: async (_context, input) => {
      const ended = await deps.identity.endAll(input.subject);
      if (!ended.ok) return failed(ended.error);
      if (ended.value === "not_configured")
        return failed(appError("account.sign_out_everywhere_unavailable"));
      return ok({ ended: true as const });
    },
  });

import { appError, defineOperation, failed, ok, shape, textField, type Result } from "../kernel";

/** Account data as the sign-in service confirms it in the verified token (passwords never belong here, FR-ACC-03). */
export type AccountData = {
  subject: string;
  email: string;
  displayName: string | null;
  emailConfirmed: boolean;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * Reads the account data from the claims of an already verified token.
 * Returns `null` if subject or email is missing. The address counts as confirmed only with the value `true`.
 */
export function accountFromClaims(claims: Record<string, unknown>): AccountData | null {
  const subject = text(claims["sub"]);
  const email = text(claims["email"]);
  if (!subject || !email) return null;
  return {
    subject,
    email: email.toLowerCase(),
    displayName: text(claims["name"]),
    emailConfirmed: claims["email_verified"] === true,
  };
}

/** An account shares data with friends only once the email address is confirmed (US-ACC-01, P-05). */
export function mayShareWithFriends(account: AccountData): boolean {
  return account.emailConfirmed;
}

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

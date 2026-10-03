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

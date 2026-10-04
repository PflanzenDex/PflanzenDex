import { defineOperation, integerField, ok, orNull, shape } from "../kernel";
import { isOperator, type AccessStore } from "./access";
import { INVITATION_VALIDITY_DAYS, newInvitationCode } from "./invitation-code";

const DAY_MS = 86_400_000;

export interface InvitationDependencies {
  readonly access: AccessStore;
  /** n bytes from a cryptographically secure source (the API passes `crypto.randomBytes`). */
  readonly random: (bytes: number) => Uint8Array;
  readonly now: () => Date;
}

/** The answer carries the code exactly once: afterwards only its hash exists, nobody can show it again. */
export interface CreatedInvitation {
  readonly id: string;
  readonly code: string;
  /** UTC instant (ISO 8601). */
  readonly expiresAt: string;
}

const schema = shape({
  validForDays: orNull(integerField("validForDays", INVITATION_VALIDITY_DAYS)),
});

/**
 * Creates an invitation code (US-ACC-05, P-03). Only the operator may; the database checks the role again. The code is
 * single use and expires after `validForDays` (default 7, 1 to 30): the expiry is an UTC instant computed from the
 * clock of the caller. Only the hash of the code is stored (the adapter hashes), so a leaked database holds no codes.
 */
export const invitationCreate = (deps: InvitationDependencies) =>
  defineOperation({
    name: "invitation.create",
    schema,
    authorized: isOperator(deps.access),
    run: async ({ userId }, input) => {
      const code = newInvitationCode(deps.random);
      const days = input.validForDays ?? INVITATION_VALIDITY_DAYS.default;
      const expiresAt = new Date(deps.now().getTime() + days * DAY_MS).toISOString();
      const saved = await deps.access.createInvitation(userId, {
        code: code.replaceAll("-", ""),
        expiresAt,
      });
      return ok<CreatedInvitation>({ id: saved.id, code, expiresAt: saved.expiresAt });
    },
  });

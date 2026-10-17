import {
  appError,
  defineOperation,
  failed,
  ok,
  shape,
  textField,
  type ErrorDetail,
  type Result,
} from "../kernel";
import { isOperator, type AccessStore } from "./access";
import { normalizeInvitationCode } from "./invitation-code";

const flag = (field: string) => (value: unknown) =>
  typeof value === "boolean" ? value : ({ field, code: "input.invalid" } as ErrorDetail);

/**
 * The operator sets whether registration needs an invitation code (US-ACC-05, P-03). Existing accounts are not
 * affected, they sign in as before. Operator only; the database checks the role again.
 */
export const registrationSetMode = (deps: { access: AccessStore }) =>
  defineOperation<{ invitationOnly: boolean }, { invitationOnly: boolean }>({
    name: "registration.set_mode",
    schema: shape({ invitationOnly: flag("invitationOnly") }),
    authorized: isOperator(deps.access),
    run: async ({ userId }, input) => {
      await deps.access.setInvitationOnly(userId, input.invitationOnly);
      return ok({ invitationOnly: input.invitationOnly });
    },
  });

const subjectSchema = shape({ subject: textField("subject", { min: 1, max: 200 }) });

/**
 * Registers the verified subject of the sign-in service with an invitation code (US-ACC-05). There is no account yet,
 * so this is not an operation with a signed-in context and idempotency key; it is naturally repeatable: once the
 * account exists, a repeat returns `registered: false` and uses up no further code. Unknown, used, expired and
 * malformed codes all answer the same `invitation.invalid`, so the answer is no oracle for guessing codes.
 */
export const registerWithInvitation =
  (deps: { access: AccessStore }) =>
  async (input: { subject: unknown; code: unknown }): Promise<Result<{ registered: boolean }>> => {
    const subject = subjectSchema({ subject: input.subject });
    if (!subject.ok) return subject;
    const code = normalizeInvitationCode(input.code);
    if (code === null) return failed(appError("invitation.invalid"));
    const outcome = await deps.access.register(subject.value.subject, code);
    if (outcome === "invalid") return failed(appError("invitation.invalid"));
    return ok({ registered: outcome === "registered" });
  };

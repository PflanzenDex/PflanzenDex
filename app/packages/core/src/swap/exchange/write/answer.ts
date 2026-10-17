import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
  type ErrorCode,
  type ErrorDetail,
} from "../../../kernel";
import { OFFER_LIMITS } from "../../offer";
import {
  SWAP_ACTIONS,
  type SwapAnswerOutcome,
  type ExchangeDependencies,
  type SwapAction,
  type SwapStatus,
} from "../types";

const REFUSAL: Record<Exclude<SwapAnswerOutcome, "ok">, ErrorCode> = {
  not_found: "swap.not_found",
  not_allowed: "swap.not_allowed",
  wrong_state: "swap.wrong_state",
  offer_not_open: "offer.not_active",
  friendship_ended: "swap.friendship_ended",
};

const REASON_LIMITS = { min: 1, max: 200 } as const;

const action = (value: unknown): SwapAction | ErrorDetail =>
  (SWAP_ACTIONS as readonly unknown[]).includes(value)
    ? (value as SwapAction)
    : { field: "action", code: "input.invalid" };

interface Input {
  swapId: string;
  action: SwapAction;
  reason: string | null;
  proposal: string | null;
}

/**
 * Answers or changes a swap of the caller (US-SOZ-10, P-03). The giver accepts (the offer is reserved, the other open
 * requests for it are declined automatically), declines (optionally with a reason), proposes something else (the
 * counter-offer is replaced by free text, the request stays open) or cancels an accepted swap (the offer is open
 * again); the requester withdraws a request or an acceptance. Both sides change together; states only move forward
 * (`requested -> accepted`, terminal `declined`, `canceled`, `withdrawn`, DM-SOZ-03); repeating an action that already
 * holds changes nothing. A swap that is not the caller's, also a foreign or unknown id, is `swap.not_found` (P-04).
 * Nothing is written on a refusal, except that a swap behind an ended friendship is canceled (`swap.friendship_ended`).
 */
export const swapAnswer = (deps: Pick<ExchangeDependencies, "swaps">) =>
  defineOperation<Input, { readonly status: SwapStatus | null }>({
    name: "swap.answer",
    schema: (raw: unknown) => {
      const base = shape({
        swapId: idField("swapId"),
        action,
        reason: orNull(textField("reason", REASON_LIMITS)),
        proposal: orNull(textField("proposal", OFFER_LIMITS.note)),
      })(raw);
      if (base.ok && base.value.action === "propose" && base.value.proposal === null)
        return failed(
          appError("input.invalid", { details: [{ field: "proposal", code: "input.invalid" }] }),
        );
      return base;
    },
    run: async ({ userId }, input) => {
      const r = await deps.swaps.answer(userId, input.swapId, {
        action: input.action,
        reason: input.action === "decline" || input.action === "cancel" ? input.reason : null,
        proposal: input.action === "propose" ? input.proposal : null,
      });
      return r.outcome === "ok" ? ok({ status: r.status }) : failed(appError(REFUSAL[r.outcome]));
    },
  });

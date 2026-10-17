import {
  appError,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
  type ErrorDetail,
} from "../../../../kernel";
import type { FriendStore } from "../../types";

export interface AnswerDependencies {
  readonly friends: FriendStore;
}

const decision = (field: string) => (value: unknown) =>
  value === "accept" || value === "decline"
    ? value
    : ({ field, code: "input.invalid" } as ErrorDetail);

/**
 * Answers a friendship request the account received (US-SOZ-02, P-03). Accepting makes the friendship effective on
 * both sides in one transaction (FR-SOZ-05 style: no half-friendship). Declining discards silently: the receiver's
 * list shows nothing, the sender sees only "not accepted". Before the answer only the display name is known, no
 * collection (P-05). Answering the same way twice writes nothing; a request that is unknown, foreign or sent by the
 * caller is `friend.request_not_found`; answering the other way after the answer is `friend.request_answered`.
 */
export const friendAnswer = (deps: AnswerDependencies) =>
  defineOperation<
    { requestId: string; decision: "accept" | "decline" },
    { status: "confirmed" | "declined" }
  >({
    name: "friend.answer",
    schema: shape({ requestId: idField("requestId"), decision: decision("decision") }),
    run: async ({ userId }, input) => {
      const r = await deps.friends.answer(userId, input.requestId, input.decision === "accept");
      if (r === "not_found") return failed(appError("friend.request_not_found"));
      if (r === "not_open") return failed(appError("friend.request_answered"));
      return ok({ status: r === "accepted" ? "confirmed" : "declined" });
    },
  });

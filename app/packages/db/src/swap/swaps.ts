import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { runHandover, type HandoverSession, type ReceiveRefusal } from "./handover.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface FriendOfferRow {
  readonly ownerId: string;
  /** The name as the caller stored it for the friend; `null` = none (P-08). */
  readonly ownerName: string | null;
  readonly offerId: string;
  readonly specimenId: string;
  readonly type: "cutting" | "plant" | "offshoot";
  readonly mode: "swap" | "give_away";
  readonly wish: string | null;
  readonly note: string | null;
  readonly offeredAt: string;
  readonly photosShared: boolean;
}

export type RequestOutcome =
  | "requested"
  | "offer_unknown"
  | "own_offer"
  | "not_open"
  | "already_requested"
  | "counter_not_allowed"
  | "counter_unknown"
  | "counter_not_shared";

export interface RequestResult {
  readonly outcome: RequestOutcome;
  readonly swapId: string | null;
}

/** One side of a swap as its owner sees it. */
export interface SwapRow {
  readonly swapId: string;
  readonly role: "giver" | "recipient";
  readonly otherId: string;
  readonly otherName: string | null;
  readonly offerId: string;
  readonly speciesLatin: string | null;
  readonly speciesGerman: string | null;
  readonly type: "cutting" | "plant" | "offshoot";
  readonly mode: "swap" | "give_away";
  readonly counterName: string | null;
  readonly counterText: string | null;
  readonly status: "requested" | "accepted" | "handed_over" | "declined" | "canceled" | "withdrawn";
  readonly requestedAt: string;
  /** The reason a person gave with a decline or cancelation. */
  readonly reason: string | null;
  /** Why the system ended the swap: another request was accepted, the friendship ended, the offer was withdrawn. */
  readonly cause: "already_given" | "friendship_ended" | "offer_withdrawn" | null;
  /** The giver changed the counter-offer ("propose something else"). */
  readonly proposal: boolean;
  readonly decidedAt: string | null;
  readonly confirmedGiver: boolean;
  readonly confirmedRecipient: boolean;
  /** The marker the recipient chose for the new specimen. */
  readonly recipientMarker: string | null;
  /** The specimen the giver gave (giver's row) and the one the recipient received (recipient's row). */
  readonly givenSpecimenId: string | null;
  readonly receivedSpecimenId: string | null;
  readonly handedOverAt: string | null;
}

/** What an answer changes: the action, the optional reason (decline, cancel) and the proposal (propose). */
export interface SwapChange {
  readonly action: SwapAction;
  readonly reason: string | null;
  readonly proposal: string | null;
}

export type SwapAction = "accept" | "decline" | "propose" | "cancel" | "withdraw";
export type AnswerOutcome =
  "ok" | "not_found" | "not_allowed" | "wrong_state" | "offer_not_open" | "friendship_ended";
export interface AnswerResult {
  readonly outcome: AnswerOutcome;
  readonly status: SwapRow["status"] | null;
}

const SWAP_COLUMNS = `swap_id as "swapId", role, other_id as "otherId", other_name as "otherName", offer_id as "offerId",
  species_latin as "speciesLatin", species_german as "speciesGerman", type, mode, counter_name as "counterName",
  counter_text as "counterText", status,
  to_char(requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "requestedAt", reason, cause, proposal,
  to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "decidedAt",
  confirmed_giver as "confirmedGiver", confirmed_recipient as "confirmedRecipient", recipient_marker as "recipientMarker",
  given_specimen_id as "givenSpecimenId", received_specimen_id as "receivedSpecimenId",
  to_char(handed_over_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "handedOverAt"`;

/**
 * Adapter for swaps and the offers of friends (US-SOZ-09, ADR 0012). Friends' offers come only through the function
 * `friend_offers()`, a request only through `request_swap()`, which writes both sides in one transaction; the table
 * rows of a swap are read under the normal row rule, so each side sees exactly its own row (P-04, P-05).
 */
export class SwapsPostgres {
  constructor(private readonly pool: Pool) {}

  /** The open offers of the caller's confirmed friends whose specimen is shared; newest first, own offers never. */
  async friendOffers(userId: string): Promise<readonly FriendOfferRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<FriendOfferRow>(
        `select owner_id as "ownerId", owner_name as "ownerName", offer_id as "offerId", specimen_id as "specimenId",
                type, mode, wish, note,
                to_char(offered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "offeredAt",
                share_photos as "photosShared"
           from friend_offers() order by offered_at desc, offer_id`,
      ),
    );
    return r.rows;
  }

  /** Requests an offer of a friend; see `request_swap()` for the outcomes. Nothing is written unless `requested`. */
  async request(
    userId: string,
    offerId: string,
    counterSpecimenId: string | null,
    counterText: string | null,
  ): Promise<RequestResult> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ outcome: RequestOutcome; swapId: string | null }>(
        `select outcome, swap_id as "swapId" from request_swap($1, $2, $3)`,
        [offerId, counterSpecimenId, counterText],
      ),
    );
    return r.rows[0] as RequestResult;
  }

  /**
   * Answers or changes a swap of the caller (see `answer_swap()`): the giver accepts, declines, proposes something else
   * or cancels an accepted swap, the requester withdraws. Both sides change together; nothing is written on a refusal.
   */
  async answer(userId: string, swapId: string, change: SwapChange): Promise<AnswerResult> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<AnswerResult>(`select outcome, status from answer_swap($1, $2, $3, $4)`, [
        swapId,
        change.action,
        change.reason,
        change.proposal,
      ]),
    );
    return r.rows[0] as AnswerResult;
  }

  /** Cancels the open swaps of the caller whose friendship is gone (the hook after ending a friendship); the count. */
  async cancelOrphaned(userId: string): Promise<number> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ n: number }>("select cancel_orphaned_swaps() as n"),
    );
    return (r.rows[0] as { n: number }).n;
  }

  /**
   * The handover as one transaction as the caller (US-SOZ-11, ADR 0012): `work` runs the steps through the session and
   * decides whether to commit; a refused step rolls everything back and comes back as `{ refused }`.
   */
  handover<T>(
    userId: string,
    work: (session: HandoverSession) => Promise<{ readonly commit: boolean; readonly value: T }>,
  ): Promise<T | { readonly refused: ReceiveRefusal | "specimen_gone" }> {
    return runHandover(this.pool, userId, work);
  }

  /**
   * From whom the caller received each of the given specimens (US-SOZ-13): the stored name of the giver and the
   * handover instant. Only specimens received in a handed-over swap are in the answer; foreign ids are invisible.
   */
  async provenanceFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, { from: string | null; date: string }>> {
    if (specimenIds.length === 0) return new Map();
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ id: string; from: string | null; date: string }>(
        `select received_specimen_id as id, other_name as "from",
                to_char(handed_over_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as date
           from swap where role = 'recipient' and status = 'handed_over' and received_specimen_id = any($1)`,
        [specimenIds],
      ),
    );
    return new Map(r.rows.map((z) => [z.id, { from: z.from, date: z.date }]));
  }

  /** The caller's own side of every swap, newest first. */
  async list(userId: string): Promise<readonly SwapRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SwapRow>(`select ${SWAP_COLUMNS} from swap order by requested_at desc, swap_id`),
    );
    return r.rows;
  }
}

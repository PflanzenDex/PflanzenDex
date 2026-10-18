import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  shape,
  timeZoneField,
} from "../../../kernel";
import type { ExchangeDependencies } from "../../exchange";
import { matchDeck } from "../deck";
import type { MatchAnswers } from "./types";

/** The answers that are stored (DM-TAU-01); a Yes is the swap request and has no row here. */
export const MATCH_ANSWERS = ["no", "later"] as const;
export type MatchAnswer = (typeof MATCH_ANSWERS)[number];

/**
 * "No" or "Later" on a match card (US-TAU-02, DM-TAU-01, P-03). The answer is stored privately for the caller only; the
 * giver learns nothing (FR-TAU-02). The offer must be a card the caller can see in the deck or the Later list right
 * now: an offer of a stranger, an own, ended or unmatched offer answers like a missing one (`offer.not_found`, P-05), so
 * no answer can be stored for something the caller may not see. Species and giver name are copied so the entry stays
 * readable when the offer ends (P-10). The date is the local date of the caller (NFR-08). Answering again replaces the
 * earlier answer; the same Idempotency-Key replays the first reply.
 */
export const matchAnswer = (deps: ExchangeDependencies, answers: MatchAnswers, clock: () => Date) =>
  defineOperation<
    { offerId: string; answer: MatchAnswer; timeZone: string },
    { answeredOn: string }
  >({
    name: "swap.match_answer",
    schema: shape({
      offerId: idField("offerId"),
      answer: choiceField("answer", MATCH_ANSWERS),
      timeZone: timeZoneField("timeZone"),
    }),
    run: async ({ userId }, input) => {
      const deck = await matchDeck(deps, { answers, clock }, userId, {
        timeZone: input.timeZone,
      });
      if (!deck.ok) return deck;
      const card = [
        ...deck.value.cards,
        ...deck.value.entries.flatMap((e) => (e.card ? [e.card] : [])),
      ].find((c) => c.offerId === input.offerId);
      if (!card) return failed(appError("offer.not_found"));
      const answeredOn = localToday(clock(), input.timeZone);
      await answers.save(userId, {
        offerId: card.offerId,
        answer: input.answer,
        answeredOn,
        speciesLatin: card.speciesLatin,
        speciesGerman: card.speciesGerman,
        giverName: card.ownerName,
      });
      return ok({ answeredOn });
    },
  });

/**
 * Takes an answer back (P-03): "Undo" after No or Later (US-TAU-02), "Reconsider" on a declined offer and "Remove from
 * list" for an entry whose offer ended (US-TAU-06). The card is open again if the offer is still a match. Only the
 * caller's own answer can be found; an unknown one is `offer.not_found`. A Yes is no answer here: it is withdrawn in
 * "Requests".
 */
export const matchUndo = (answers: MatchAnswers) =>
  defineOperation<{ offerId: string }, { undone: true }>({
    name: "swap.match_undo",
    schema: shape({ offerId: idField("offerId") }),
    run: async ({ userId }, input) =>
      (await answers.remove(userId, input.offerId))
        ? ok({ undone: true })
        : failed(appError("offer.not_found")),
  });

// Decision on a suggestion (US-ENT-04): Yes puts the species on the wishlist, No keeps it there as discarded, Later
// writes nothing. The wish takes its values from the suggestion the server derives itself (P-01, P-03): the client
// names only the species and the decision, so a made-up card cannot be written.
import {
  choiceField,
  appError,
  defineOperation,
  failed,
  localToday,
  ok,
  shape,
  textField,
  timeZoneField,
} from "../../kernel";
import { WISH_LIMITS, wishNameKey, type WishStore } from "../../wishlist";
import { candidatesFor } from "../suggestions/suggestions";
import type { Suggestion, SuggestionsDependencies } from "../suggestions";

export interface DecideDependencies extends Omit<SuggestionsDependencies, "wishes"> {
  readonly wishes: Pick<WishStore, "open" | "bought" | "discarded" | "create">;
  readonly clock: () => Date;
}

export interface DecideResult {
  readonly decision: "yes" | "no" | "later";
  /** False for Later and when the species had a wish already: nothing was written (FR-WUN-06). */
  readonly saved: boolean;
}

const schema = shape({
  species: textField("species", { min: 1, max: 200 }),
  decision: choiceField("decision", ["yes", "no", "later"] as const),
  timeZone: timeZoneField("timeZone"),
});

/** Only an https image with a source that fits the column limits is taken over; a picture never comes without its source (P-08). */
function image(s: Suggestion) {
  const usable =
    s.imageUrl !== null &&
    s.imageUrl.startsWith("https://") &&
    s.imageUrl.length <= WISH_LIMITS.imageUrl.max &&
    s.sourceUrl !== null &&
    s.sourceUrl.length <= WISH_LIMITS.imageSource.max &&
    !/^https:\/\/[^/?#]*@/i.test(s.imageUrl);
  return usable
    ? { imageUrl: s.imageUrl, imageSource: s.sourceUrl }
    : { imageUrl: null, imageSource: null };
}

/**
 * `discover.decide` (US-ENT-04). Assumptions, decided by the PO: the "catalog reference" of the wish is the Latin name
 * (the wish has no species column yet; the name key makes it unique, FR-WUN-06); the target zone is the account's zone
 * n-th (as in US-ENT-03); the license stays unknown because the card carries none (P-08); the reasons are those the
 * keeper saw, joined into one text. A species that already has a wish of any status gets no second one
 * (`saved: false`); a species that is not among the account's suggestions is refused with `discover.not_suggested`.
 */
export const discoverDecide = (deps: DecideDependencies) =>
  defineOperation({
    name: "discover.decide",
    schema,
    run: async ({ userId }, input) => {
      if (input.decision === "later") return ok<DecideResult>({ decision: "later", saved: false });
      const { candidates, names, stock } = await candidatesFor(deps, userId, input.timeZone);
      const key = wishNameKey(input.species);
      const found = candidates.find((c) => wishNameKey(c.species) === key);
      if (!found) {
        if (names.some((n) => wishNameKey(n) === key))
          return ok<DecideResult>({ decision: input.decision, saved: false });
        return failed(appError("discover.not_suggested"));
      }
      const zone = found.lightZone === null ? undefined : stock[found.lightZone - 2];
      const r = await deps.wishes.create(userId, {
        name: found.species,
        nameKey: key,
        german: found.germanName,
        targetZoneId: zone?.zoneId ?? null,
        difficulty: found.difficulty,
        reasoning: found.reasons.join(" ").slice(0, WISH_LIMITS.reasoning.max),
        ...image(found),
        license: null,
        source: "discover",
        decidedAt: localToday(deps.clock(), input.timeZone),
        status: input.decision === "yes" ? "wishlist" : "discarded",
      });
      if (r === "name_taken") return ok<DecideResult>({ decision: input.decision, saved: false });
      // The zone comes from the account's own stock; if it vanished meanwhile nothing is written (P-10).
      if (r === "zone_unknown") return failed(appError("light_zone.not_found"));
      return ok<DecideResult>({ decision: input.decision, saved: true });
    },
  });

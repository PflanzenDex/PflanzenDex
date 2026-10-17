import { titleOf } from "../candidates";
import type { WishStore } from "../types";

export interface BoughtDependencies {
  readonly wishes: Pick<WishStore, "bought">;
}

export interface BoughtWish {
  readonly id: string;
  readonly name: string;
  /** "German (name)"; just the name while no German name is known (P-08). */
  readonly title: string;
  /** The specimen the wish became (US-WUN-05); `null` until it is linked. */
  readonly specimenId: string | null;
}

/** The history of purchases (US-WUN-03) with what to do next (P-09). */
export interface BoughtList {
  readonly bought: readonly BoughtWish[];
  readonly hint: { readonly text: string; readonly nextAction: string };
}

function hintFor(count: number): BoughtList["hint"] {
  if (count === 0)
    return {
      text: "Noch kein Wunsch ist als gekauft vermerkt.",
      nextAction: "Hast du einen Kandidaten gekauft, tippe bei ihm auf „Gekauft“.",
    };
  return {
    text:
      count === 1
        ? "1 Wunsch ist als gekauft vermerkt."
        : `${count} Wünsche sind als gekauft vermerkt.`,
    nextAction:
      "Fehlt eine dieser Pflanzen noch in deiner Sammlung, lege sie dort als Exemplar an.",
  };
}

/**
 * The bought wishes of the account (US-WUN-03): they left the candidate list but are kept, so a purchase never
 * disappears silently (P-10). Only the own wishes flow in (P-04, P-05). The link to the specimen (US-WUN-05) is part
 * of each entry; a wish without one offers the way to the plant.
 */
export async function wishBought(deps: BoughtDependencies, userId: string): Promise<BoughtList> {
  const rows = await deps.wishes.bought(userId);
  return {
    bought: rows.map((w) => ({
      id: w.id,
      name: w.name,
      title: titleOf(w),
      specimenId: w.specimenId,
    })),
    hint: hintFor(rows.length),
  };
}

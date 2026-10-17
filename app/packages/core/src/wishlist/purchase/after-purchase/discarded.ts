import { titleOf } from "../../candidates";
import type { WishStore } from "../../types";

export interface DiscardedDependencies {
  readonly wishes: Pick<WishStore, "discarded">;
}

export interface DiscardedWish {
  readonly id: string;
  readonly name: string;
  /** "German (name)"; just the name while no German name is known (P-08). */
  readonly title: string;
}

/** The discarded wishes (US-WUN-05) with what to do next (P-09). */
export interface DiscardedList {
  readonly discarded: readonly DiscardedWish[];
  readonly hint: { readonly text: string; readonly nextAction: string };
}

const NEXT = "Ein verworfener Wunsch bleibt zur Erinnerung gespeichert; er zählt nirgends mit.";

/** The discarded wishes of the account: they left the candidate list but are kept (P-10). Only the own ones flow in (P-04). */
export async function wishDiscarded(
  deps: DiscardedDependencies,
  userId: string,
): Promise<DiscardedList> {
  const rows = await deps.wishes.discarded(userId);
  const count = rows.length;
  return {
    discarded: rows.map((w) => ({ id: w.id, name: w.name, title: titleOf(w) })),
    hint: {
      text:
        count === 0
          ? "Kein Wunsch ist verworfen."
          : count === 1
            ? "1 Wunsch ist verworfen."
            : `${count} Wünsche sind verworfen.`,
      nextAction:
        count === 0
          ? "Tippe bei einem Kandidaten auf „Verwerfen“, wenn du ihn nicht mehr willst."
          : NEXT,
    },
  };
}

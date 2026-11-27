import type { MatchCard as Card } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { ScrollRegion } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-region/scroll-region";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../../swap.de.json";
import { Actions, type Answer } from "../match-actions/match-actions";

const t = texts(table);

/**
 * What stands under the card of the match deck: the decision buttons and the answers below the deck, which scroll in a region
 * of their own so they never take the room of the card (US-QS-15, issue 2421). The region may shrink to 4 rem and grows to
 * 9 rem. The help of requests is not here: it opens from the info button in the row of the counter (`DeckHelp`, F-0279, d-170).
 */
export function BelowCard(props: {
  c: Card;
  busy: boolean;
  answer: (a: Answer) => void;
  large: boolean;
  lists: ReactNode;
}) {
  const { c, large } = props;
  return (
    <>
      <Actions card={c} busy={props.busy} onAnswer={props.answer} large={large} />
      <ScrollRegion label={t("deck.listsLabel")} className="max-h-36 min-h-16 flex-[0_1_auto]">
        {props.lists}
      </ScrollRegion>
    </>
  );
}

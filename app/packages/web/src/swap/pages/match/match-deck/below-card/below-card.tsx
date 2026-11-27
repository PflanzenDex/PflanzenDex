import type { MatchCard as Card } from "@pflanzendex/core";
import type { ReactNode } from "react";
import { ScrollRegion } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-region/scroll-region";
import { texts } from "@/shared/lib/text-rules/texts";
import { MoreHelp } from "@/shared/ui/more-help";
import table from "../../../../swap.de.json";
import { Actions, type Answer } from "../match-actions/match-actions";

const t = texts(table);

/**
 * What stands under the card of the match deck: one line of help (SG-COPY-05, US-QS-32, F-0279; the rest sits behind Mehr
 * erfahren), the decision buttons, and the answers below the deck, which scroll in a region of their own so they never take
 * the room of the card (US-QS-15, issue 2421). The region may shrink to 4 rem and grows to 9 rem.
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
      <MoreHelp className="text-center" more={t("deck.askMore")}>
        {t("deck.askLine", { name: c.ownerName ?? t("deck.friendFallback") })}
      </MoreHelp>
      <Actions card={c} busy={props.busy} onAnswer={props.answer} large={large} />
      <ScrollRegion label={t("deck.listsLabel")} className="max-h-36 min-h-16 flex-[0_1_auto]">
        {props.lists}
      </ScrollRegion>
    </>
  );
}

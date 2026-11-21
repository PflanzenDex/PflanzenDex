import type { EmptyReason } from "@pflanzendex/core";
import { Link } from "react-router";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import {
  EXCHANGE_PATH,
  MATCH_PATH,
  PATHS,
  WISHLIST_MODE_ADDRESS,
} from "@/shared/patterns/navigation/navigation/navigation";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../../../swap.de.json";

const t = texts(table);

/** The text and the one filled action (label and href) of each empty reason (US-TAU-07, P-09); all texts come from the message table. */
type EmptyText = { title: string; description: string; action: string; href: string };
const EMPTY_TEXT: Record<EmptyReason, EmptyText> = {
  no_friends: {
    title: t("match.empty.noFriends.title"),
    description: t("match.empty.noFriends.description"),
    action: t("match.empty.noFriends.action"),
    href: PATHS.friends,
  },
  no_wishes: {
    title: t("match.empty.noWishes.title"),
    description: t("match.empty.noWishes.description"),
    action: t("match.empty.noWishes.action"),
    href: WISHLIST_MODE_ADDRESS,
  },
  no_offers: {
    title: t("match.empty.noOffers.title"),
    description: t("match.empty.noOffers.description"),
    action: t("match.empty.noOffers.action"),
    href: EXCHANGE_PATH,
  },
  no_match: {
    title: t("match.empty.noMatch.title"),
    description: t("match.empty.noMatch.description"),
    action: t("match.empty.noMatch.action"),
    href: EXCHANGE_PATH,
  },
  // US-TAU-03: every offer that matches a wish has my open request; the next step is Requests (P-09).
  all_requested: {
    title: t("match.empty.allRequested.title"),
    description: t("match.empty.allRequested.description"),
    action: t("match.empty.allRequested.action"),
    href: `${EXCHANGE_PATH}?part=requests`,
  },
  // US-TAU-07: no card is left because my No or Later holds the rest; the next step is the deck with its lists (P-09).
  all_answered: {
    title: t("match.empty.allAnswered.title"),
    description: t("match.empty.allAnswered.description"),
    action: t("match.empty.allAnswered.action"),
    href: MATCH_PATH,
  },
};

/** The empty deck names the reason and the next step (US-TAU-07, P-09); one filled action, the other ways stay as text links. */
export function Empty(props: { reason?: EmptyReason | null }) {
  const reason = props.reason ?? "no_match";
  const text = EMPTY_TEXT[reason];
  const invite = reason === "no_friends";
  return (
    <div className="grid gap-3">
      <EmptyState
        className="gap-3 py-6"
        title={text.title}
        description={text.description}
        action={{ label: text.action, href: text.href }}
      />
      <div className="flex flex-wrap justify-center gap-x-4">
        {reason === "no_wishes" && (
          <Button asChild variant="link" size="touch">
            <Link to={PATHS.discover}>{t("match.empty.link.discover")}</Link>
          </Button>
        )}
        {!invite && reason !== "no_wishes" && (
          <Button asChild variant="link" size="touch">
            <Link to={WISHLIST_MODE_ADDRESS}>{t("match.empty.link.wishlist")}</Link>
          </Button>
        )}
        {!invite && (
          <Button asChild variant="link" size="touch">
            <Link to={PATHS.friends}>{t("match.empty.link.friends")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

import { localToday, type Feed } from "@pflanzendex/core";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { summaryDate } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import { currentTimeZone } from "../../../../shared/data";
import table from "../../../social.de.json";

const t = texts(table);

/**
 * The hint of "Neu bei Freunden": one line of text, the one action that fits its state (P-09), and "Stand" as its own
 * muted line (FR-SOZ-03). The state is `hint.kind` (US-QS-32, F-0258): no friend yet offers "Freund hinzufügen", a friend
 * who shares nothing offers "Selbst etwas teilen"; both open a layer of the friends page the feed sits in.
 */
export function FeedHint(props: { feed: Feed }) {
  const { feed } = props;
  const addFriend = useLayer("add");
  const share = useLayer("sharing");
  const copyDay = localToday(new Date(feed.asOf), currentTimeZone());
  const today = localToday(new Date(), currentTimeZone());
  return (
    <>
      <p className="text-sm">{feed.hint.text}</p>
      {feed.hint.kind === "no_friends" && (
        <Button
          type="button"
          className="self-start"
          onClick={(e) => addFriend.openLayer(e.currentTarget)}
        >
          {t("feed.addFriend")}
        </Button>
      )}
      {feed.hint.kind === "nothing_shared" && (
        <Button
          type="button"
          className="self-start"
          onClick={(e) => share.openLayer(e.currentTarget)}
        >
          {t("feed.shareOwn")}
        </Button>
      )}
      {/* Only an older copy says so (FR-SOZ-03): a copy of today needs no "Stand". Calendar dates of the keeper's zone. */}
      {copyDay < today && (
        <p className="text-sm text-muted-foreground">
          {t("feed.asOf", { date: summaryDate(copyDay, today) })}
        </p>
      )}
    </>
  );
}

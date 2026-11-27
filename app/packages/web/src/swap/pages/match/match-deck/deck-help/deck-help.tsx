import { Info } from "lucide-react";
import { useRef } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { Button } from "@/shared/ui/button";
import table from "../../../../swap.de.json";

const t = texts(table);

/**
 * The help of the match deck behind an info button in the row of the counter (US-QS-15, US-QS-32, F-0279, owner decision
 * d-170): what a request tells the friend, and what "Ablehnen" and "Später" do. It stood as a block under the card; at 360 x 640
 * px that block made the frame scroll, so the card has the room again and the help opens in a sheet (a dialog from 768 px,
 * `ResponsiveModal`). The button is a 44 px target (SG-TOUCH-01) and makes the row of the counter 44 px high: a negative margin
 * that kept the row to one line put the top of the target under the edge of the frame and its foot under the card, and cut
 * the focus ring (issue 2611). The focus returns to the button when the sheet closes, also where a tap does not focus a button.
 */
export function DeckHelp(props: { friend: string | null }) {
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <ResponsiveModal
      title={t("deck.helpTitle")}
      returnFocusTo={opener}
      trigger={
        <Button
          ref={opener}
          type="button"
          variant="plain"
          size="icon"
          aria-label={t("deck.helpButton")}
          className="shrink-0"
        >
          <Info aria-hidden="true" className="size-5" />
        </Button>
      }
    >
      <div className="grid gap-2 text-sm">
        <p className="m-0">
          {t("deck.askLine", { name: props.friend ?? t("deck.friendFallback") })}
        </p>
        <p className="m-0">{t("deck.askMore")}</p>
      </div>
    </ResponsiveModal>
  );
}

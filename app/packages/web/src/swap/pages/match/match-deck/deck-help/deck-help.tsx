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
 * `ResponsiveModal`). The button is a 44 px target that does not make the row taller than its line (the negative margin, as
 * the credit of the card does), and the focus returns to it when the sheet closes, also where a tap does not focus a button.
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
          className="-my-3 shrink-0"
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

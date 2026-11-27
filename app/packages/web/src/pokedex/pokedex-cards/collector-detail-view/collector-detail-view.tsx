import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CollectorCard as Card } from "@pflanzendex/core";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button";
import { CollectorDetails } from "../collector-card/collector-details/collector-details";
import table from "../collector-cards/collector-cards.de.json";

const t = texts(table);

/**
 * The details of one collector card in the place of the cards, inside the open sheet "Sammlerkarten" (US-POK-01, US-QS-15,
 * owner decision d-163): a sheet never opens a second sheet (SG-SHEET-03), so "Mehr" replaces the content of the sheet, the
 * title of the sheet is the name of the card, and "Zurück zu den Karten" leads back. The focus moves to the back button
 * when the details appear (WCAG 2.4.3) and the sheet scrolls back to the top; Escape and "Schließen" still close the whole
 * sheet. The sections are those of `CollectorDetails`, "Quellen" among them.
 */
export function CollectorDetailView(props: { card: Card; onBack: () => void }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = back.current;
    if (!button) return;
    button.focus({ preventScroll: true });
    const region = button.closest<HTMLElement>("[data-scroll-region]");
    if (region && typeof region.scrollTo === "function") region.scrollTo({ top: 0 });
  }, []);
  return (
    <div className="grid min-w-0 gap-3">
      <Button
        ref={back}
        type="button"
        variant="plain"
        size="sm"
        className="w-fit"
        onClick={props.onBack}
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
        {t("back")}
      </Button>
      <CollectorDetails card={props.card} />
    </div>
  );
}

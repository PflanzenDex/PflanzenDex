import { useState, type ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../plant-layers.de.json";
import { ResultHost } from "../../plant-layer.slot";

const t = texts(table);

/** The filled action of the layer (SG-BTN-02): measuring, the first thing next to a plant (P-11, US-QS-23). */
export function MeasureButton(props: { card: SpecimenCard; onMeasure: () => void }) {
  return (
    <Button
      type="button"
      aria-label={t("overview.measureLabel", { name: props.card.name })}
      onClick={props.onMeasure}
    >
      {t("overview.measure")}
    </Button>
  );
}

/**
 * The quick actions of a plant under the title of its layer, on the overview only (US-QS-23, US-QS-15, owner decision 2026-11-22, issue 2424):
 * "Messen" filled, "Gießen" and "Foto" tinted (SG-BTN-01, SG-BTN-02). "Messen" and "Foto" open the measure form, "Foto" with the
 * photo picker started (`onPhoto`); a layer that cannot measure shows neither. "Gießen" is the slot of `monitoring`; its result
 * is drawn into the line directly below the row (owner decision d-130, issue 2536): "Gegossen heute · Rückgängig" or "Zuletzt
 * gegossen: heute". The line is in the part of the layer that stays in place, so it is in view wherever the content is scrolled,
 * and "Gießen" keeps the focus (SG-FEED-03, SG-FEED-05); it is empty and hidden (`empty:hidden`) until a result is in it, so it takes no
 * place and no gap before. It is no live region: the shared live region says the result (SG-FEED-04, DS-69). The row wraps (the
 * buttons share it and move to the next row at 200 % text, NFR-13) and every button keeps its 44 px. The calm note of the first
 * plant (US-ONB-07) stands under the line.
 */
export function QuickActions(props: {
  card: SpecimenCard;
  onMeasure?: (() => void) | undefined;
  onPhoto?: (() => void) | undefined;
  /** The button "Gießen" of the slot; it draws its result into the line under the row (`ResultHost`). */
  water?: ReactNode;
  note?: ReactNode;
}) {
  const { card } = props;
  // The line is a state, not a ref, so the slot gets it as soon as it has mounted (a portal needs the element itself).
  const [resultHost, setResultHost] = useState<HTMLElement | null>(null);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div
        role="group"
        aria-label={t("overview.quickLabel")}
        className="flex flex-wrap gap-2 [&>button]:grow [&>button]:basis-1/4"
      >
        {props.onMeasure ? <MeasureButton card={card} onMeasure={props.onMeasure} /> : null}
        <ResultHost.Provider value={resultHost}>{props.water}</ResultHost.Provider>
        {props.onPhoto ? (
          <Button
            type="button"
            variant="tinted"
            aria-label={t("overview.photoLabel", { name: card.name })}
            onClick={props.onPhoto}
          >
            {t("overview.photo")}
          </Button>
        ) : null}
      </div>
      <div ref={setResultHost} className="empty:hidden" />
      {props.note}
    </div>
  );
}

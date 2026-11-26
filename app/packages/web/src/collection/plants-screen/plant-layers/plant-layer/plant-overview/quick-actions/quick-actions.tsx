import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
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
 * is drawn into `resultHost`, the line of the overview that gives its place to it, so no button moves (SG-FEED-05, issue 2462).
 * The row wraps (the buttons share it and move to the next row at 200 % text, NFR-13) and every button keeps its 44 px. The calm
 * note of the first plant (US-ONB-07) stands directly under the row.
 */
export function QuickActions(props: {
  card: SpecimenCard;
  onMeasure?: (() => void) | undefined;
  onPhoto?: (() => void) | undefined;
  /** The button "Gießen" of the slot, without its result host. */
  water?: ReactNode;
  /** The line of the overview whose place the result of "Gießen" takes; `null` until the overview has mounted it. */
  resultHost?: HTMLElement | null | undefined;
  note?: ReactNode;
}) {
  const { card } = props;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div
        role="group"
        aria-label={t("overview.quickLabel")}
        className="flex flex-wrap gap-2 [&>button]:grow [&>button]:basis-1/4"
      >
        {props.onMeasure ? <MeasureButton card={card} onMeasure={props.onMeasure} /> : null}
        <ResultHost.Provider value={props.resultHost ?? null}>{props.water}</ResultHost.Provider>
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
      {props.note}
    </div>
  );
}

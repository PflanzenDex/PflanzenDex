import { useId, useState, type ReactNode } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { Button } from "@/shared/ui/button";
import table from "./card-more.de.json";

const t = texts(table);

/**
 * The details of a card behind its "Mehr" button (US-QS-15, US-QS-32, owner decision d-066): a sheet at half height below
 * 768 px, a dialog from 768 px (`ResponsiveModal`, so the heights, the handle, the toggle "Vollbild" / "Halbe Höhe", the
 * close control and the focus return are the sheet's own, SG-SHEET-02). The sheet is titled with the name of the card. The
 * button reads "Mehr" and is named "Mehr: {name}" for assistive technology, so the visible word starts the name (WCAG 2.5.3)
 * and a row of cards has one button per card that says which card it opens. The details are built only while the sheet is
 * open or still sliding out: a row of many cards stays light. The sheet is not a layer of the address (`?sheet=`), because
 * the details of a card are no place of the app; a card inside a layer opens it above the layer.
 */
export function CardMore(props: { name: string; children: ReactNode }) {
  const [built, setBuilt] = useState(false);
  return (
    <ResponsiveModal
      title={props.name}
      halfHeight
      onOpenChange={(open) => {
        if (open) setBuilt(true);
      }}
      onExited={() => setBuilt(false)}
      trigger={
        <Button
          type="button"
          variant="plain"
          size="sm"
          aria-label={t("openNamed", { name: props.name })}
          className="shrink-0"
        >
          {t("open")}
        </Button>
      }
    >
      {built ? props.children : null}
    </ResponsiveModal>
  );
}

/** One section of the details: a region named by its heading, a level below the title of the sheet (SG-HEAD-03). */
export function CardSection(props: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-1 break-words">
      <h3 id={id} className="m-0 text-base font-semibold">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

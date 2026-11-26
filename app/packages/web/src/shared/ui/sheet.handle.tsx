import * as React from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import type { Detent } from "./sheet.detents";
import table from "./sheet.de.json";

const t = texts(table);

/** What the handle of a sheet with two heights does with the keyboard (US-QS-15). */
export type HandleKeys = {
  mode: Detent;
  /** What a screen reader reads as the value of the handle: the title and the height ("Details, Vollbild"). */
  valueText: string;
  select: (detent: Detent) => void;
};

type SheetHandleProps = {
  /** The pointer handlers of the drag (`useHandleDrag`). */
  drag: React.HTMLAttributes<HTMLElement>;
  /** Present for a sheet with two heights: the handle is then a control for the keyboard and for a screen reader. */
  keys?: HandleKeys | undefined;
};

/** Arrow up grows the sheet to full height, arrow down returns it to half height; at half height it stays (never closes). Enter switches. */
function onKeyDown(keys: HandleKeys) {
  return (event: React.KeyboardEvent<HTMLElement>) => {
    const next =
      event.key === "ArrowUp"
        ? "full"
        : event.key === "ArrowDown"
          ? "half"
          : event.key === "Enter"
            ? keys.mode === "full"
              ? "half"
              : "full"
            : null;
    if (next === null) return;
    event.preventDefault();
    keys.select(next);
  };
}

/** The handle is drawn in the input boundary token: 4.8:1 on the card in light, 4.4:1 in dark (WCAG 1.4.11). */
const BAR =
  "h-1.5 w-12 rounded-full bg-input forced-colors:border forced-colors:border-[color:ButtonText]";
const HANDLE =
  "flex h-11 w-full shrink-0 touch-none select-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * The handle of a bottom sheet (US-QS-15, SG-SHEET-02): a bar in a target of 44 px. A drag on it changes the height of the
 * sheet (`useHandleDrag`). A sheet with two heights makes it a separator that takes the focus: arrow up and arrow down
 * change the height, and its value text is the announcement ("Details, Vollbild"): a screen reader reads it as the value changes,
 * so the sheet does not announce a second time while the handle has the focus (WCAG 2.5.1, 2.5.7, 4.1.3). A sheet
 * with one height leaves it to the pointer; it has no role and no tab stop. Neither takes the focus on open (`data-sheet-chrome`).
 */
export function SheetHandle({ drag, keys }: SheetHandleProps) {
  const control = keys
    ? ({
        role: "separator",
        tabIndex: 0,
        "aria-label": t("sheet.handle"),
        "aria-orientation": "horizontal",
        "aria-valuemin": 50,
        "aria-valuemax": 100,
        "aria-valuenow": keys.mode === "full" ? 100 : 50,
        "aria-valuetext": keys.valueText,
        onKeyDown: onKeyDown(keys),
      } as const)
    : {};
  return (
    <div data-sheet-handle="" data-sheet-chrome="" className={HANDLE} {...drag} {...control}>
      <span aria-hidden="true" className={BAR} />
    </div>
  );
}

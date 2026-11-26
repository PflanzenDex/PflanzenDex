import * as React from "react";
import { Drawer } from "vaul";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cva } from "class-variance-authority";

/**
 * The title takes the focus by script, so it draws no browser outline, as the layer heading does (US-QS-15, F15). Its
 * focus ring shows only after keyboard input (DS-37, issue 1714): a pointer user gets no frame, a keyboard user the ring.
 * The ring sits inside the title's box, because the sheet spans the full width of the window and an outer ring would be
 * cut off at its edges.
 */
const TITLE =
  "min-w-0 flex-1 text-lg font-semibold focus-visible:outline-none keyboard-input:focus-visible:ring-2 keyboard-input:focus-visible:ring-inset keyboard-input:focus-visible:ring-ring";

/** The title: drawn, or read to assistive technology only in a window too short for the whole header (DS-34: a variant). */
const titleLook = cva(TITLE, {
  variants: { readOnly: { true: "sr-only", false: "" } },
  defaultVariants: { readOnly: false },
});

/**
 * The close button beside the title (SG-SHEET-02, SG-TOUCH-03): the dialog's close (`dialog.tsx`), at the trailing edge of
 * the title row. 44 px square, centred on the first line of the title: the vertical margins are half of what 44 px exceed
 * the line (1.75 rem), so the row keeps the height of the title line at every text size. It never shrinks, so a title that
 * wraps at a large text size wraps beside it.
 */
const CLOSE =
  "-mr-2 my-[calc(0.875rem_-_22px)] inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-control forced-colors:border forced-colors:border-[color:ButtonText] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The toggle between half and full height (US-QS-15): the close button's shape, beside it. */
const TOGGLE = CLOSE.replace("-mr-2 ", "");

/** The toggle of a sheet with two heights: its name is the height it switches to ("Vollbild", "Halbe Höhe"). */
export type HeightToggle = { full: boolean; label: string; onToggle: () => void };

/**
 * The title row of a bottom sheet (SG-SHEET-02, SG-SHEET-04): the title, and at its trailing edge the close button, which
 * calls `onClose`. A sheet with two heights has the toggle of the height beside the close button (US-QS-15). The button is `data-close`, so a layer's focus rules never take it for the first control of the content
 * (US-QS-32).
 *
 * A sheet that offers a bar slot (`barSlot`) has the bar above the title: a form draws "Abbrechen" and its confirming
 * action into it (`FormBar`). While a form has done so (`barActive`) the row is two rows, the bar and then the title, so a
 * long title or a large text size never meets the buttons; "Abbrechen" is then the one close control and the X is gone.
 * Without bar actions the X stays exactly as it was. The empty slot takes no room. In a window too short for the whole header
 * (`compact`: the keyboard is open at a large text size) the title is read to assistive technology only, so the bar and a
 * field of the form fit (SG-FORM-02).
 */
export function TitleRow(props: {
  title: string;
  closeLabel: string;
  close: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  barSlot?: ((element: HTMLElement | null) => void) | undefined;
  barActive?: boolean | undefined;
  /** The window is too short for the full header (`useCrampedWindow`): the title stays for assistive technology only. */
  compact?: boolean | undefined;
  /** A sheet with two heights: the toggle between them. */
  toggle?: HeightToggle | undefined;
  /** The handle stands above the row and brings the space of its own: the row needs no top padding. */
  handle?: boolean | undefined;
}) {
  const bar = props.barActive === true;
  return (
    <div className={props.handle ? "px-4" : "px-4 pt-3"}>
      {props.barSlot ? (
        <div ref={props.barSlot} data-sheet-bar="" className="flex flex-col pb-1 empty:hidden" />
      ) : null}
      <div className="flex items-start gap-2">
        <Drawer.Title
          tabIndex={-1}
          className={titleLook({ readOnly: bar && props.compact === true })}
        >
          {props.title}
        </Drawer.Title>
        {props.toggle ? (
          <button
            type="button"
            data-sheet-chrome=""
            aria-label={props.toggle.label}
            onClick={props.toggle.onToggle}
            className={TOGGLE}
          >
            {props.toggle.full ? (
              <Minimize2 aria-hidden="true" className="size-5" />
            ) : (
              <Maximize2 aria-hidden="true" className="size-5" />
            )}
          </button>
        ) : null}
        {/* A close is the same as Back and a tap on the scrim: the parent's guard asks for unsaved input (US-QS-32). */}
        {bar ? null : (
          <button
            ref={props.close}
            type="button"
            data-close
            aria-label={props.closeLabel}
            onClick={props.onClose}
            className={CLOSE}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

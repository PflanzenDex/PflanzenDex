import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { texts } from "@/shared/lib/text-rules/texts";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { Button } from "@/shared/ui/button/button";
import table from "./growth-note-layer.de.json";

const t = texts(table);

/** A tap in the form outside the note, or a key that types into it: a printable character or an edit key (issue 1644). */
const closesNote = (event: Event): boolean =>
  event.type !== "keydown" ||
  (event as KeyboardEvent).key.length === 1 ||
  (event as KeyboardEvent).key === "Backspace" ||
  (event as KeyboardEvent).key === "Delete";

/** The controls of a form field: the note sits just below the row of the one that has the focus (issue 1644). */
const FIELD = "input, select, textarea";

/**
 * Places the card just below the row of the focused field of the form, or at the top of the form when no field has the
 * focus. Returns the element that had the focus, so "Schließen" can give the focus back to it (issue 1644).
 */
function placeCard(wrapEl: HTMLElement, cardEl: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  const focus = active instanceof HTMLElement && !cardEl.contains(active) ? active : null;
  const field = focus && wrapEl.contains(focus) && focus.matches(FIELD) ? focus : null;
  const top = field ? field.getBoundingClientRect().bottom - wrapEl.getBoundingClientRect().top : 0;
  cardEl.style.top = `${top}px`;
  return focus;
}

/**
 * Calls `dismiss` when the keeper types or taps in the form outside the note (`isOutside`), or when the focus moves
 * there (a Tab into a covered control, issue 1644). Returns the cleanup.
 */
function listenForDismiss(
  isOutside: (target: EventTarget | null) => boolean,
  dismiss: () => void,
): () => void {
  const onKeyOrTap = (event: Event) => {
    if (isOutside(event.target) && closesNote(event)) dismiss();
  };
  const onFocus = (event: FocusEvent) => {
    if (isOutside(event.target)) dismiss();
  };
  document.addEventListener("keydown", onKeyOrTap);
  document.addEventListener("pointerdown", onKeyOrTap);
  document.addEventListener("focusin", onFocus);
  return () => {
    document.removeEventListener("keydown", onKeyOrTap);
    document.removeEventListener("pointerdown", onKeyOrTap);
    document.removeEventListener("focusin", onFocus);
  };
}

/**
 * The growth note after a save (US-ACH-05, DS-54, issue 1644): an overlay over the form that takes no place in the flow,
 * so the form and the controls below it never move when it appears. It sits just below the row of the focused field, so
 * the field the keeper works in is never covered; when no field has the focus it sits at the top of the form. The sticky
 * save button paints over it (its z-index is higher), and at 200 % text the note scrolls inside 40 % of the window
 * height. It is announced once per save (DS-69). It closes with "Schließen" (the focus goes back to the control it came
 * from), when the keeper types or taps in the form outside the note, when the focus moves into the form outside the note
 * (a Tab into a covered control), and at the next save (`saves` counts the saves of the view).
 */
export function GrowthNoteLayer(props: {
  note: string | null;
  saves: number;
  children: ReactNode;
}) {
  const { note, saves, children } = props;
  const announce = useAnnounce()?.announce;
  const [closedFor, setClosedFor] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const announced = useRef<number | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const visible = note !== null && closedFor !== saves;

  useEffect(() => {
    if (note === null || announced.current === saves) return;
    announced.current = saves;
    announce?.(note);
  }, [note, saves, announce]);

  // Placed once when the note appears (or a save shows it again): the card scrolls with the form, so its place holds
  // while it stays open.
  useLayoutEffect(() => {
    if (visible && wrap.current && card.current) {
      returnTo.current = placeCard(wrap.current, card.current);
    }
  }, [visible, saves]);

  useEffect(() => {
    if (!visible) return;
    return listenForDismiss(
      (target) =>
        target instanceof Node &&
        Boolean(wrap.current?.contains(target)) &&
        !card.current?.contains(target),
      () => setClosedFor(saves),
    );
  }, [visible, saves]);

  const close = () => {
    setClosedFor(saves);
    returnTo.current?.focus();
  };

  return (
    <div ref={wrap} className="relative flex min-w-0 flex-col">
      {visible && note !== null ? (
        <div
          ref={card}
          data-slot="growth-note"
          className="absolute inset-x-0 top-0 z-[5] mt-2 flex max-h-[40vh] flex-col items-start gap-2 overflow-y-auto break-words rounded-card border border-border bg-card p-3 text-sm text-card-foreground shadow-elevation-2 forced-colors:border-[CanvasText]"
        >
          <p className="m-0 tabular-nums">{note}</p>
          <Button type="button" variant="outline" size="sm" onClick={close}>
            {t("close")}
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

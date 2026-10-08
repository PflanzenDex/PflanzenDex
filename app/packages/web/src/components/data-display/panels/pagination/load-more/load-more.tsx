import * as React from "react";
import { PlantLoader } from "@/components/shared/states/plant-loader/plant-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LoadMoreProps = {
  /** Items shown now. */
  loadedCount: number;
  /** Items in total; `undefined` while unknown (the count then reads "n geladen", never an invented total, P-08). */
  totalCount?: number | undefined;
  /** More items can be fetched (react-query: `hasNextPage`). */
  hasMore: boolean;
  /** A page is being fetched (react-query: `isFetchingNextPage`). */
  pending: boolean;
  onLoadMore: () => void;
  /** Button text (German). */
  label?: string;
  /** Text of the button and of the announcement while fetching (German). */
  pendingLabel?: string;
  className?: string;
};

/** Visible and spoken count: "40 von 120 angezeigt" or, with an unknown total, "40 angezeigt". */
function countText(loaded: number, total?: number): string {
  return total === undefined ? `${loaded} angezeigt` : `${loaded} von ${total} angezeigt`;
}

/** Live-region text for a finished load: how many arrived and where the list stands now. */
function resultText(added: number, loaded: number, total?: number): string {
  return `${added} weitere geladen. ${countText(loaded, total)}.`;
}

type Refs = {
  button: React.RefObject<HTMLButtonElement | null>;
  done: React.RefObject<HTMLParagraphElement | null>;
};

/** The new items are inserted above the button and push it down: keep a focused button in view, no jump (WCAG 2.4.7). */
function keepInView(button: HTMLButtonElement | null) {
  if (!button || document.activeElement !== button) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  button.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
}

/** Tracks the load the user asked for: announces its result and puts lost focus back (see {@link LoadMore}). */
function useLoadRequest(props: LoadMoreProps, refs: Refs) {
  const { loadedCount, totalCount, hasMore, pending, onLoadMore } = props;
  // The load the user asked for: item count at the click, whether it was seen pending, whether the button had focus.
  const request = React.useRef<{ count: number; saw: boolean; focused: boolean } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  React.useEffect(() => {
    const req = request.current;
    if (!req) return;
    if (pending) {
      req.saw = true;
      return;
    }
    if (loadedCount > req.count) {
      setAnnouncement(resultText(loadedCount - req.count, loadedCount, totalCount));
      // A disabled button drops focus to the body; put it back unless the user moved on to another control.
      const active = document.activeElement;
      const lost = !active || active === document.body || active === refs.button.current;
      if (req.focused && lost) (hasMore ? refs.button.current : refs.done.current)?.focus();
      if (req.focused && hasMore) keepInView(refs.button.current);
    } else if (!req.saw) return; // not started yet
    request.current = null; // done, or failed (the parent shows the error, P-10)
  }, [pending, loadedCount, totalCount, hasMore]);

  const onClick = () => {
    request.current = {
      count: loadedCount,
      saw: false,
      focused: document.activeElement === refs.button.current,
    };
    onLoadMore();
  };

  return { announcement, onClick };
}

/**
 * "Mehr laden" (US-QS-07, DS-34): a button on the shared Button that appends the next page. Controlled and independent
 * of react-query (map `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`). While fetching it is disabled, busy and
 * shows the PlantLoader in a slot that is always reserved, so nothing shifts. A polite live region announces the added
 * count and "n von m" once per finished load the user asked for (not on first render). Focus stays on the button: a disabled button drops
 * focus in browsers, so it is put back when the fetch ends. When the last page arrived the button is replaced by the
 * focusable "Alles geladen" note and focus moves there, so it never falls back to the page start.
 */
export function LoadMore(props: LoadMoreProps) {
  const { loadedCount, totalCount, hasMore, pending } = props;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const doneRef = React.useRef<HTMLParagraphElement>(null);
  const { announcement, onClick } = useLoadRequest(props, { button: buttonRef, done: doneRef });

  return (
    <div className={cn("flex min-h-[88px] flex-col items-center gap-2", props.className)}>
      <p className="text-sm text-muted-foreground">{countText(loadedCount, totalCount)}</p>
      {hasMore ? (
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={onClick}
          className="min-w-[200px]"
        >
          <span className="inline-flex size-6 items-center justify-center">
            {pending ? <PlantLoader size="sm" decorative /> : null}
          </span>
          {pending ? (props.pendingLabel ?? "Lädt…") : (props.label ?? "Mehr laden")}
        </Button>
      ) : (
        <p
          ref={doneRef}
          tabIndex={-1}
          className="flex min-h-[44px] items-center rounded-control text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Alles geladen
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

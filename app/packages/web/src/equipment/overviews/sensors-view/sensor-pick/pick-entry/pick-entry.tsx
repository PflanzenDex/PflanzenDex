import type { KeyboardEvent, RefObject } from "react";
import { Check } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { HAIRLINE } from "@/shared/lists/grouped-list/group-classes";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";

/** The mark of an entry, for the keys that walk the list. */
export const ENTRY = "[data-pick-entry]";

/**
 * One entry of the pick list: its whole name wraps (SG-TYPE-05), and the current one carries a check mark and `aria-current`,
 * so it does not rest on colour or weight alone (SG-COLOR-05). The entry is `aria-disabled`, not `disabled`, while a write
 * runs: a disabled focused control loses the focus (F-0094). The ring lies inside the row, so the scrolling list does not clip
 * it (DS-37).
 */
export function PickEntry(props: {
  name: string;
  current: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <li className={HAIRLINE}>
      <Button
        type="button"
        variant="ghost"
        size="row"
        data-pick-entry=""
        aria-current={props.current ? "true" : undefined}
        aria-disabled={props.busy || undefined}
        className={cn(BUSY_LOOK, "focus-visible:ring-inset focus-visible:ring-offset-0")}
        onClick={() => {
          if (!props.busy) props.onPick();
        }}
      >
        <span
          className={cn(
            "min-w-0 flex-1 hyphens-auto [overflow-wrap:anywhere]",
            props.current && "font-semibold",
          )}
        >
          {props.name}
        </span>
        {props.current && <Check aria-hidden="true" className="size-5 shrink-0" />}
      </Button>
    </li>
  );
}

/**
 * The arrow keys, Home and End walk the entries inside `list`; the arrow up on the first entry leads back to the search.
 * Without the focus on an entry nothing happens, so the keys keep their meaning in the search field.
 */
export function walkEntries(
  event: KeyboardEvent<HTMLElement>,
  search: RefObject<HTMLInputElement | null>,
): void {
  const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ENTRY));
  const at = entries.findIndex((e) => e === document.activeElement);
  if (at === -1) return;
  const last = entries.length - 1;
  const to = { ArrowDown: Math.min(at + 1, last), ArrowUp: at - 1, Home: 0, End: last }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  if (to < 0) search.current?.focus();
  else entries[to]?.focus();
}

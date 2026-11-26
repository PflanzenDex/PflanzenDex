import { useMemo, useRef, type ReactNode } from "react";
import { scrollToTop } from "@/shared/platform/device/motion/scroll-top";
import { LetterStrip } from "@/shared/ui/letter-strip";
import { firstIndexes, MIN_ROWS } from "@/shared/ui/letter-strip.letters";

/**
 * A long list sorted by name with the letter index at its trailing edge (SG-LIST-11, issue 2419). The index shows only when
 * the list is sorted by name (`byName`) and has more than `MIN_ROWS` rows; otherwise this renders its list as it is. The rows
 * give up the width of the strip, so it covers no row action. A jump scrolls the list's own box (`data-scroll-region`) to the
 * first entry of the letter at once; the entries are all there (a list that loads from a server in parts cannot jump to a
 * letter it has not loaded: the caller shows the index only for a list that is complete). `children` is the list.
 */
export function IndexedList<T>(props: {
  items: readonly T[];
  /** The name an entry is sorted and filed by (the name the row shows). */
  nameOf: (item: T) => string;
  /** The list is sorted by name; otherwise the letters would say nothing about its order. */
  byName: boolean;
  /** Accessible name of the strip (German), e.g. "Zum Buchstaben springen". */
  label: string;
  children: ReactNode;
}) {
  const { items, nameOf } = props;
  const box = useRef<HTMLDivElement>(null);
  const first = useMemo(() => firstIndexes(items.map(nameOf)), [items, nameOf]);
  const present = useMemo(() => new Set(first.keys()), [first]);
  if (!props.byName || items.length <= MIN_ROWS) return <>{props.children}</>;
  const jump = (letter: string) => {
    const index = first.get(letter);
    const scroller = box.current?.querySelector<HTMLElement>("[data-scroll-region]");
    const list = scroller?.matches("ul") ? scroller : scroller?.querySelector("ul");
    const entry = index === undefined ? undefined : list?.children.item(index);
    if (scroller && entry instanceof HTMLElement) scrollToTop(scroller, entry, true);
  };
  return (
    <div ref={box} className="relative flex min-h-0 min-w-0 flex-1 gap-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{props.children}</div>
      <LetterStrip label={props.label} present={present} onJump={jump} />
    </div>
  );
}

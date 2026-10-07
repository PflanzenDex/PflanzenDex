import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaginationProps = {
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Accessible name of the navigation (German). */
  label?: string;
  className?: string;
};

export type PageSlot = number | "gap-start" | "gap-end";

/**
 * Page numbers to show. Up to 7 pages all appear; beyond that the list is always 7 slots (first, last, the current page
 * with one neighbour each side, collapsed gaps) so the bar keeps its width while you page through.
 */
export function pageSlots(page: number, pageCount: number): PageSlot[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "gap-end", pageCount];
  if (page >= pageCount - 3)
    return [1, "gap-start", ...[4, 3, 2, 1, 0].map((back) => pageCount - back)];
  return [1, "gap-start", page - 1, page, page + 1, "gap-end", pageCount];
}

function PageButton(props: { n: number; current: boolean; onSelect: (n: number) => void }) {
  return (
    <Button
      type="button"
      variant={props.current ? "default" : "ghost"}
      size="icon"
      aria-label={`Seite ${props.n}`}
      aria-current={props.current ? "page" : undefined}
      onClick={() => props.onSelect(props.n)}
      className="rounded-full tabular-nums"
    >
      {props.n}
    </Button>
  );
}

/**
 * Numbered pagination (US-QS-07, DS-34): a named `nav` with previous and next and a list of pages; the current one has
 * `aria-current="page"`. Every control is a 44 px target on the shared Button. From `sm` the numbers show with
 * collapsed gaps ("…"); on a phone, where 7 targets do not fit 360 px, "Seite n von m" replaces them between the arrows.
 * Controlled: the parent owns `page` (for react-query keep it in the query key).
 */
export function Pagination(props: PaginationProps) {
  const { page, pageCount, onPageChange } = props;
  if (pageCount < 1) return null;
  return (
    <nav aria-label={props.label ?? "Seitennavigation"} className={cn("w-full", props.className)}>
      <ul className="flex items-center justify-center gap-1">
        <li>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Vorherige Seite"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden="true" className="size-5 forced-colors:[stroke:ButtonText]" />
          </Button>
        </li>
        <li className="min-w-[8.5rem] text-center text-sm font-semibold sm:hidden">
          Seite {page} von {pageCount}
        </li>
        {pageSlots(page, pageCount).map((slot) =>
          typeof slot === "number" ? (
            <li key={slot} className="hidden sm:block">
              <PageButton n={slot} current={slot === page} onSelect={onPageChange} />
            </li>
          ) : (
            <li key={slot} aria-hidden="true" className="hidden min-w-[44px] text-center sm:block">
              …
            </li>
          ),
        )}
        <li>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Nächste Seite"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight aria-hidden="true" className="size-5 forced-colors:[stroke:ButtonText]" />
          </Button>
        </li>
      </ul>
    </nav>
  );
}

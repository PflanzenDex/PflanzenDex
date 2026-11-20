import type { ReactNode } from "react";
import { Link } from "react-router";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button/button";
import { RowChevron } from "@/shared/lists/grouped-list/row-parts/row-parts";
import { NavNote } from "@/shared/patterns/navigation/nav-note/nav-note";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";

/** A count that is still loading, failed to load, or is known (P-10); calm mode passes `hidden` (US-ACH-08). */
export type TileCount = number | "loading" | "error" | "hidden";

// Neutral like every count (US-QS-32, SG-COLOR-02): the card colour and foreground text, no green outline.
const TILE =
  "h-auto min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-card border-transparent bg-card p-3 text-left text-foreground hover:bg-muted hover:text-foreground";

function CountText({ count }: { count: TileCount }) {
  if (count === "hidden") return null;
  // A box of the count line's height from the first frame, its bar after the delay (SG-STATE-02, F-0247, DS-57): the tile
  // has its final size while the count loads, so the rows below do not move when it arrives. A shaped placeholder is not
  // held (DS-57). The bar is a span, not `Skeleton` (a div), because it sits inside the tile's button.
  if (count === "loading")
    return (
      <span data-count-skeleton="" className="flex h-5 items-center">
        <DelayedSkeleton>
          <span
            aria-hidden="true"
            className="block h-3.5 w-10 animate-pulse rounded-control bg-muted motion-reduce:animate-none"
          />
          <span className="sr-only">lädt …</span>
        </DelayedSkeleton>
      </span>
    );
  if (count === "error")
    return <span className="text-sm text-muted-foreground">nicht geladen</span>;
  // Zero reads as "nothing to do", not as a number to work through (issue 1045).
  if (count === 0) return <span className="text-sm text-muted-foreground">keine</span>;
  return <span className="text-sm tabular-nums text-muted-foreground">{count}</span>;
}

function Face(props: { name: string; count?: TileCount }) {
  return (
    <>
      <span className="font-semibold">{props.name}</span>
      {props.count !== undefined && <CountText count={props.count} />}
    </>
  );
}

/** A tile that opens the layer `id` (US-QS-20): the name, and the count unless calm mode hides it. */
export function LayerTile(props: { id: string; name: string; count?: TileCount }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="outline"
      className={TILE}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <Face name={props.name} {...(props.count !== undefined ? { count: props.count } : {})} />
    </Button>
  );
}

/**
 * A tile that leads to an existing view; while its function is locked the address shows the lock page (US-ONB-05), and
 * the tile carries the text mark `note` ("Bald", "Noch gesperrt") like the navigation instead of a count.
 */
export function LinkTile(props: { to: string; name: string; count?: TileCount; note?: string }) {
  return (
    <Button asChild variant="outline" className={TILE}>
      <Link to={props.to}>
        <Face name={props.name} {...(props.count !== undefined ? { count: props.count } : {})} />
        <NavNote text={props.note} />
      </Link>
    </Button>
  );
}

/**
 * A full-width row that opens the layer `id`: the name left, the current state right, and the neutral chevron of every
 * opener at the trailing edge (SG-TOUCH-02, issue 2355). The text wraps in its own block, so the chevron keeps its place
 * at the trailing edge at a large text size (SG-ICON-01).
 */
export function LayerRow(props: { id: string; name: string; state: ReactNode }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-12 w-full justify-start gap-3 rounded-card border-transparent bg-card px-3 py-2 text-left text-foreground hover:bg-muted hover:text-foreground"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-semibold">{props.name}</span>
        {/* No truncation: at a larger text size the state wraps below the name instead of being cut (issue 1019). */}
        <span className="min-w-0 text-sm tabular-nums text-muted-foreground">{props.state}</span>
      </span>
      <RowChevron />
    </Button>
  );
}

/** "Mehr erfahren" next to the one line of help (DS-61): opens the full explanation as a layer. */
export function HelpOpener() {
  const { open, openLayer } = useLayer("help");
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="px-1"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      Mehr erfahren
    </Button>
  );
}

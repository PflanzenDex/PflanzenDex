import type { ReactNode } from "react";
import { Link } from "react-router";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { RowChevron } from "@/shared/lists/grouped-list/row-parts/row-parts";
import { NavNote } from "@/shared/patterns/navigation/nav-note/nav-note";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import table from "../../../social.de.json";

const tx = texts(table);
const px = plurals(table);

/** A count that is still loading, failed to load, or is known (P-10); calm mode passes `hidden` (US-ACH-08). */
export type TileCount = number | "loading" | "error" | "hidden";

// Neutral like every count (US-QS-32, SG-COLOR-02): the card colour and foreground text, no green fill or outline. The tile is
// a ghost button (neutral, no border): a tile that navigates is a row, not a tinted or plain action (SG-BTN-01).
const TILE =
  "h-auto min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-card bg-card p-3 text-left text-foreground hover:bg-muted hover:text-foreground";

/** A count that is loading: a box of the count line's height from the first frame, its bar after the delay (SG-STATE-02, DS-57). */
function CountLoading() {
  // A box of the count line's height from the first frame, its bar after the delay (SG-STATE-02, F-0247, DS-57): the tile
  // has its final size while the count loads, so the rows below do not move when it arrives. A shaped placeholder is not
  // held (DS-57). The bar is a span, not `Skeleton` (a div), because it sits inside the tile's button.
  return (
    <span data-count-skeleton="" className="flex h-5 items-center">
      <DelayedSkeleton>
        <span
          aria-hidden="true"
          className="block h-3.5 w-10 animate-pulse rounded-control bg-muted motion-reduce:animate-none"
        />
        <span className="sr-only">{tx("friendsPage.count.loading")}</span>
      </DelayedSkeleton>
    </span>
  );
}

function CountText({ count }: { count: TileCount }) {
  if (count === "hidden") return null;
  if (count === "loading") return <CountLoading />;
  if (count === "error")
    return <span className="text-sm text-muted-foreground">{tx("friendsPage.count.failed")}</span>;
  // Zero reads as "nothing to do", not as a number to work through (issue 1045).
  if (count === 0) return <span className="text-sm text-muted-foreground">keine</span>;
  return <span className="text-sm tabular-nums text-muted-foreground">{count}</span>;
}

/**
 * The meta line of a counted row: what the count counts, in words ("2 warten auf deine Antwort"), because a bare number does
 * not name its thing and breaks no word at 200 % text (SG-LIST-05, US-QS-15). Calm mode shows no line (US-ACH-08); a count
 * that loads or fails says so (P-10); zero is a quiet line, not a number.
 */
export function countMeta(count: TileCount, say: (n: number) => string): ReactNode {
  if (count === "hidden") return undefined;
  if (count === "loading") return <CountLoading />;
  if (count === "error") return tx("friendsPage.count.failed");
  return say(count);
}

/** The line of the requests row: how many wait for my answer (US-SOZ-02). */
export const requestsMeta = (n: number) =>
  n === 0 ? tx("friendsPage.requests.none") : px.counted("friendsPage.requests.waiting", n);

/** The line of the news row: how many new plants friends have (US-SOZ-06). */
export const newsMeta = (n: number) =>
  n === 0 ? tx("friendsPage.news.none") : px.counted("friendsPage.news.plants", n);

function Face(props: { name: string; count?: TileCount }) {
  return (
    <>
      <span className="font-semibold">{props.name}</span>
      {props.count !== undefined && <CountText count={props.count} />}
    </>
  );
}

/**
 * A counted row that opens the layer `id` (US-QS-20, issue 2419): the name, one line under it that says what the count counts
 * (`meta`, none in calm mode) and the neutral chevron of every opener. It is the row of `GroupedList`, not a tile.
 */
export function LayerCountRow(props: { id: string; name: string; meta: ReactNode }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <GroupedRow
      title={props.name}
      meta={props.meta}
      haspopup="dialog"
      expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    />
  );
}

/**
 * A tile that leads to an existing view; while its function is locked the address shows the lock page (US-ONB-05), and
 * the tile carries the text mark `note` ("Bald", "Noch gesperrt") like the navigation instead of a count.
 */
export function LinkTile(props: { to: string; name: string; count?: TileCount; note?: string }) {
  return (
    <Button asChild variant="ghost" className={TILE}>
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
      variant="ghost"
      className="h-auto min-h-12 w-full justify-start gap-3 rounded-card bg-card px-3 py-2 text-left text-foreground hover:bg-muted hover:text-foreground"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{props.name}</span>
        {/* No truncation: at a larger text size the state wraps below the name instead of being cut (issue 1019). */}
        <span className="min-w-0 text-sm tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
          {props.state}
        </span>
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

/** The two tiles of the exchange (US-QS-20): the open offers of friends and the offers that match the wishlist. */
export function ExchangeTiles(props: {
  counts: { offers: TileCount | undefined; matching: TileCount | undefined };
  swapMark?: string | undefined;
}) {
  const { counts } = props;
  const note = props.swapMark ? { note: props.swapMark } : {};
  return (
    // Two tiles per row while a label fits (9 rem, starting value at normal text); at a larger text size one per row, so
    // no label runs into its neighbour (issue 1019).
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
      <LinkTile
        to="/friends/exchange"
        name={tx("friendsPage.exchange")}
        {...(counts.offers !== undefined ? { count: counts.offers } : {})}
        {...note}
      />
      <LinkTile
        to="/friends/match"
        name={tx("friendsPage.match")}
        {...(counts.matching !== undefined ? { count: counts.matching } : {})}
        {...note}
      />
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Button } from "@/components/ui/button/button";

/** A count that is still loading, failed to load, or is known (P-10); calm mode passes `hidden` (US-ACH-08). */
export type TileCount = number | "loading" | "error" | "hidden";

const TILE =
  "h-auto min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-card p-3 text-left";

function CountText({ count }: { count: TileCount }) {
  if (count === "hidden") return null;
  if (count === "loading") return <span className="text-sm text-muted-foreground">lädt …</span>;
  if (count === "error")
    return <span className="text-sm text-muted-foreground">nicht geladen</span>;
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

/** A tile that leads to an existing view; while its function is locked the address shows the lock page (US-ONB-05). */
export function LinkTile(props: { to: string; name: string }) {
  return (
    <Button asChild variant="outline" className={TILE}>
      <Link to={props.to}>
        <Face name={props.name} />
      </Link>
    </Button>
  );
}

/** A full-width row that opens the layer `id`: the name left, the current state right. */
export function LayerRow(props: { id: string; name: string; state: ReactNode }) {
  const { open, openLayer } = useLayer(props.id);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto min-h-12 w-full justify-between gap-3 rounded-card px-3 text-left"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="font-semibold">{props.name}</span>
      <span className="min-w-0 truncate text-sm tabular-nums text-muted-foreground">
        {props.state}
      </span>
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

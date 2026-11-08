import { lazy, Suspense, type ReactNode } from "react";
import type { TodayTile } from "@/app/destinations/today-area/today-area";

// The tile and the layer of the anniversaries (US-ACH-06) load on their own after the first paint (DS-08).
const Tile = lazy(() => import("@/achievements").then((m) => ({ default: m.AnniversaryTile })));
const Layer = lazy(() => import("@/achievements").then((m) => ({ default: m.AnniversaryLayer })));

type Token = () => Promise<string | undefined>;

/** The anniversaries of today as a tile of "Heute" with its layer, after the category tiles (US-ACH-06, issue 1662). */
export function anniversaryTile(props: {
  api: string;
  token: Token;
  onOpen: () => void;
}): TodayTile {
  return {
    id: "anniversaries",
    tile: (draw) => <LazyAnniversaryTile api={props.api} token={props.token} tile={draw} />,
    layer: <LazyAnniversaryLayer api={props.api} token={props.token} onOpen={props.onOpen} />,
  };
}

/** The anniversaries of today as a tile on "Heute", after the category tiles (US-ACH-06, issue 1662). */
export function LazyAnniversaryTile(props: {
  api: string;
  token: Token;
  tile: (count: number, label: string, layer: string) => ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <Tile {...props} />
    </Suspense>
  );
}

/** The layer behind that tile (`?sheet=anniversaries`). */
export function LazyAnniversaryLayer(props: { api: string; token: Token; onOpen: () => void }) {
  return (
    <Suspense fallback={null}>
      <Layer {...props} />
    </Suspense>
  );
}

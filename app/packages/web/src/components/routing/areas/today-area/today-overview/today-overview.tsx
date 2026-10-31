import { cn } from "@/lib/utils";
import { HintsPage } from "@/collection";
import { TreatmentsPage } from "@/care";
import { WateringList } from "@/monitoring";
import { TodayPage, type TodayDestination } from "@/today";
import type { LinkTarget } from "@/components/shared/navigation/nav-model/navigation/navigation";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";

/** What a category tile and the summary need of one list (US-QS-18). */
export type CategoryCount = {
  status: "pending" | "ready" | "error";
  count: number | undefined;
};

/** The look of a tile that opens a layer. */
const TILE =
  "h-auto min-h-14 w-full flex-col items-center justify-center gap-0 px-2 py-1 text-center";
/**
 * The category tiles: three in a row while a tile holds its label (6.5 rem, 104 px at normal text, starting value); at a
 * larger text size the tiles stack, one per row, so no label runs into its neighbour (issue 1019). The `minmax` is a rem
 * value on purpose, so it grows with the text.
 */
const TILE_GRID = "m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 p-0";
const NBSP = " ";
const count = (n: number, one: string, many: string) => `${n}${NBSP}${n === 1 ? one : many}`;

/** One tile per category: its name and count as text, the layer opens on choosing it. */
export function CategoryTile(props: { id: string; label: string; category: CategoryCount }) {
  const { category } = props;
  return (
    <li>
      <LayerOpener id={props.id} className={TILE}>
        {category.status === "ready" ? (
          <span className="text-lg font-semibold tabular-nums">{category.count}</span>
        ) : category.status === "error" ? (
          <span className="text-sm">nicht geladen</span>
        ) : (
          <span className="text-sm text-muted-foreground">lädt …</span>
        )}
        <span className="text-sm">{props.label}</span>
      </LayerOpener>
    </li>
  );
}

/** The summary of the open items per category as text; colour (a warning tint for overdue items) is only an extra cue. */
export function TodaySummary(props: {
  treatments: CategoryCount & { urgent: number | undefined };
  watering: CategoryCount;
  hints: CategoryCount;
}) {
  const { treatments, watering, hints } = props;
  const parts: string[] = [];
  const failed: string[] = [];
  const add = (c: CategoryCount, name: string, text: (n: number) => string) => {
    if (c.status === "error") failed.push(name);
    else if (c.count) parts.push(text(c.count));
  };
  add(treatments, "Behandlungen", (n) => {
    const base = count(n, "Behandlung offen", "Behandlungen offen");
    return treatments.urgent ? `${base}, davon ${treatments.urgent} überfällig` : base;
  });
  add(watering, "Gießen", (n) => count(n, "Pflanze zu gießen", "Pflanzen zu gießen"));
  add(hints, "Hinweise", (n) => count(n, "Angabe fehlt", "Angaben fehlen"));
  if (parts.length === 0 && failed.length === 0) return null;
  const tint = treatments.urgent
    ? "rounded-control border border-warning-border bg-warning px-3 py-2 text-warning-foreground"
    : "text-muted-foreground";
  return (
    <p className={cn("text-sm", tint)}>
      {parts.join(" · ")}
      {failed.length > 0 && `${parts.length > 0 ? " · " : ""}${failed.join(", ")}: nicht geladen`}
    </p>
  );
}

/**
 * The overview of "Heute": the page of the day with the summary and one tile per category (US-QS-18). The counts come
 * from the same requests and keys as the lists in the layers: both share one copy and a write updates both. Each
 * module hands its count over (`count`); the app nests them, the modules do not know each other.
 */
export function TodayOverview(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (view: LinkTarget) => void;
  open: (d: TodayDestination) => void;
}) {
  const { api, token } = props;
  return (
    <TreatmentsPage
      api={api}
      token={token}
      count={(treatments) => (
        <WateringList
          api={api}
          token={token}
          count={(watering) => (
            <HintsPage
              api={api}
              token={token}
              onOpen={props.onOpen}
              count={(hints) => (
                <TodayPage
                  api={api}
                  token={token}
                  onOpen={props.open}
                  summary={
                    <TodaySummary treatments={treatments} watering={watering} hints={hints} />
                  }
                  tiles={
                    <ul className={TILE_GRID} aria-label="Themen">
                      <CategoryTile id="treatments" label="Behandeln" category={treatments} />
                      <CategoryTile id="watering" label="Gießen" category={watering} />
                      <CategoryTile id="hints" label="Fehlt noch" category={hints} />
                    </ul>
                  }
                />
              )}
            />
          )}
        />
      )}
    />
  );
}

import { cn } from "@/shared/lib/utils";
import { HintsPage } from "@/collection";
import { TreatmentsPage } from "@/care";
import { WateringList } from "@/monitoring";
import { TodayPage, type TodayDestination } from "@/today";
import type { LinkTarget } from "@/shared/patterns/navigation/navigation/navigation";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { TodayTile } from "../today-area";
import { Tiles, type CategoryCount } from "./tiles/tiles";

const NBSP = " ";
const count = (n: number, one: string, many: string) => `${n}${NBSP}${n === 1 ? one : many}`;

/**
 * The one "Behandlungen" entry on the "Jetzt dran" row when the most urgent item is a treatment (US-QS-18): the name,
 * the count and, when there are overdue ones, how many. A loading or failed load stays visible (P-10).
 */
export function TreatmentsEntry(props: {
  treatments: CategoryCount & { urgent: number | undefined };
}) {
  const { treatments } = props;
  return (
    // A fixed 12 px side padding that does not grow with the text: at 200 % text the word "Behandlungen" fits the row
    // whole instead of breaking inside it (issue 1113).
    <LayerOpener id="treatments" className="h-auto min-h-11 max-w-full shrink-0 px-[12px] py-1">
      <span className="flex flex-col items-center text-center">
        <span>Behandlungen</span>{" "}
        {/* The second line is the count and the overdue ones; the spaces keep the accessible name readable. */}
        <span className="text-sm font-normal">
          {treatments.status === "ready" ? (
            <>
              <span className="font-semibold tabular-nums">{treatments.count}</span>
              {!!treatments.urgent && ` · ${treatments.urgent}${NBSP}überfällig`}
            </>
          ) : treatments.status === "error" ? (
            "nicht geladen"
          ) : (
            "lädt …"
          )}
        </span>
      </span>
    </LayerOpener>
  );
}

/**
 * The summary of the open items per category as text (US-QS-18). The treatments are part of it only while they have no
 * entry of their own on the "Jetzt dran" row (`withTreatments`); the warning tint is only an extra cue for overdue ones.
 */
export function TodaySummary(props: {
  withTreatments: boolean;
  treatments: CategoryCount & { urgent: number | undefined };
  watering: CategoryCount;
  hints: CategoryCount;
}) {
  const { treatments, watering, hints, withTreatments } = props;
  const parts: string[] = [];
  const failed: string[] = [];
  const add = (c: CategoryCount, name: string, text: (n: number) => string) => {
    if (c.status === "error") failed.push(name);
    else if (c.count) parts.push(text(c.count));
  };
  if (withTreatments)
    add(treatments, "Behandlungen", (n) => {
      const base = count(n, "Behandlung offen", "Behandlungen offen");
      return treatments.urgent ? `${base}, davon ${treatments.urgent} überfällig` : base;
    });
  add(watering, "Gießen", (n) => count(n, "Pflanze zu gießen", "Pflanzen zu gießen"));
  add(hints, "Hinweise", (n) => count(n, "Angabe fehlt", "Angaben fehlen"));
  if (parts.length === 0 && failed.length === 0) return null;
  const tint =
    withTreatments && treatments.urgent
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
  /** Tiles of other modules after the categories (issue 1156). */
  tiles?: readonly TodayTile[] | undefined;
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
                  treatmentsEntry={<TreatmentsEntry treatments={treatments} />}
                  summary={(treatmentFirst) => (
                    <TodaySummary
                      withTreatments={!treatmentFirst}
                      treatments={treatments}
                      watering={watering}
                      hints={hints}
                    />
                  )}
                  tiles={(treatmentFirst) => (
                    <Tiles
                      treatmentFirst={treatmentFirst}
                      treatments={treatments}
                      watering={watering}
                      hints={hints}
                      {...(props.tiles ? { more: props.tiles } : {})}
                    />
                  )}
                />
              )}
            />
          )}
        />
      )}
    />
  );
}

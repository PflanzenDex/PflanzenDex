import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { HintsPage } from "@/collection";
import { TreatmentsPage } from "@/care";
import { WateringList } from "@/monitoring";
import { TodayPage, type TodayDestination } from "@/today";
import type { LinkTarget } from "@/shared/patterns/navigation/navigation/navigation";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { GroupedRow } from "@/shared/lists/grouped-list/grouped-list";
import { NBSP } from "@/shared/lib/format";
import { plurals, texts } from "@/shared/lib/text-rules/texts";
import type { TodayTile } from "../today-area";
import table from "../today-area.de.json";
import { Tiles, type CategoryCount } from "./tiles/tiles";

const t = texts(table);
const plural = plurals(table);

/**
 * The one "Behandlungen" row of the list when the most urgent item is a treatment (US-QS-18, SG-SHAPE-02): the name, and on
 * its second line the count and the overdue ones; it opens the layer Behandlungen. A loading or failed load stays visible (P-10).
 */
export function TreatmentsEntry(props: {
  treatments: CategoryCount & { urgent: number | undefined };
}) {
  const { treatments } = props;
  const { openLayer, open } = useLayer("treatments");
  return (
    <GroupedRow
      bare
      // The amber row of the card: its warning tone keeps the text colour and drops the grey hover (SG-COLOR-04).
      tone="warning"
      haspopup="dialog"
      expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
      // The word stays whole at 200 % text: it never breaks inside itself (issue 1113).
      title={<span className="whitespace-nowrap [overflow-wrap:normal]">Behandlungen</span>}
      meta={
        <>
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
        </>
      }
    />
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
      const base = plural.counted("summary.treatments", n);
      return treatments.urgent
        ? `${base}, ${t("summary.overdue", { count: treatments.urgent })}`
        : base;
    });
  add(watering, "Gießen", (n) => plural.counted("summary.watering", n));
  add(hints, "Hinweise", (n) => plural.counted("summary.hints", n));
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
 * The line under the title (US-QS-18, F-0070): the summary, or the achievement notice in its place. The notice's slot comes
 * first and hides itself while it is empty, so a day without a notice looks as before; while it holds the notice (a `peer`)
 * the summary hides, so the notice adds no height. Without a summary the notice adds its one line.
 */
export function TitleLine(props: { notice?: ReactNode; children: ReactNode }) {
  return (
    <>
      {props.notice}
      <div className="empty:hidden peer-[:not(:empty)]:hidden">{props.children}</div>
    </>
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
  /** The slot of the achievement notice, wired by the app (F-0070). */
  notice?: ReactNode;
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
                  // One region: the page waits for the three counts (and its list) and shows one skeleton (issue 1697).
                  countsPending={[treatments, watering, hints].some((c) => c.status === "pending")}
                  treatmentsEntry={<TreatmentsEntry treatments={treatments} />}
                  summary={(treatmentFirst) => (
                    <TitleLine notice={props.notice}>
                      <TodaySummary
                        withTreatments={!treatmentFirst}
                        treatments={treatments}
                        watering={watering}
                        hints={hints}
                      />
                    </TitleLine>
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

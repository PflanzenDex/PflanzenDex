import { useCallback, useMemo } from "react";
import type { MeasurementRow } from "@pflanzendex/core";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { cn } from "@/shared/lib/utils";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementPhoto } from "../../measure/measurement-header/measurement-photo";
import { CARD_CLASSES } from "../../shared/notices/notices";
import { QUALITY_NAME, dateText, valueText } from "../../shared/text";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./plant-history.de.json";

const t = texts(table);

type Token = () => Promise<string | undefined>;

/** Entries per page (starting value, assumption): the layer shows a few whole entries, a photo is the tall part. */
const PAGE_SIZE = 3;

function Entry(props: {
  row: MeasurementRow;
  access: { api: string; token: Token; specimenId: string };
}) {
  const { row } = props;
  return (
    <div className={cn(CARD_CLASSES, "grid gap-1")}>
      <p className="font-semibold">
        {valueText(row.value)} · {dateText(row.date)}
      </p>
      <p className="text-muted-foreground">{QUALITY_NAME[row.quality]}</p>
      {row.note ? <p className="text-muted-foreground">{row.note}</p> : null}
      {row.photo ? (
        <MeasurementPhoto
          {...props.access}
          measurementId={row.id}
          photo={row.photo}
          date={row.date}
          compact
        />
      ) : null}
    </div>
  );
}

/**
 * "Verlauf" of the plant layer (US-QS-23): the measurements with their photos, newest first (the server sorts), as
 * one scrolling list. Without a measurement the tab says what to do next (P-09).
 */
export function PlantHistory(props: {
  api: string;
  token: Token;
  specimenId: string;
  /** Leaves the layer and opens the measuring. */
  onMeasure?: () => void;
  /** Entries per page; smaller when a switch sits above the list (US-WAC-07). */
  pageSize?: number;
}) {
  const { api, token, specimenId } = props;
  const key = useMemo(() => ["care", "measurements", specimenId], [specimenId]);
  const load = useCallback(
    (t: string) => loadMeasurementView(api, t, specimenId),
    [api, specimenId],
  );
  const loading = t("loading");
  return (
    <LoadFrame
      queryKey={key}
      token={token}
      load={load}
      loadingText={loading}
      loadingStatus={
        <p role="status" className="text-sm text-muted-foreground">
          {loading}
        </p>
      }
      empty={{
        isEmpty: (view) => view.measurements.length === 0,
        title: t("empty.line"),
        // An empty part of the history, not a page: one line and one tinted action (US-QS-32, SG-STATE-01).
        section: true,
        ...(props.onMeasure
          ? { action: { label: t("empty.action"), onClick: props.onMeasure } }
          : {}),
      }}
    >
      {(view) => (
        <ScrollEntries
          items={view.measurements}
          pageSize={props.pageSize ?? PAGE_SIZE}
          label={t("pager")}
          getKey={(m) => m.id}
          renderItem={(m) => <Entry row={m} access={{ api, token, specimenId }} />}
        />
      )}
    </LoadFrame>
  );
}

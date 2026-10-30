import { useCallback, useMemo } from "react";
import type { MeasurementRow } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { LoadFrame } from "../../../kernel";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { MeasurementPhoto } from "../../measure/measurement-header/measurement-photo";
import { CARD_CLASSES } from "../../shared/notices/notices";
import { QUALITY_NAME, dateText, valueText } from "../../shared/text";

type Token = () => Promise<string | undefined>;

/** Entries per page (starting value, assumption): the layer shows a few whole entries, a photo is the tall part. */
const PAGE_SIZE = 3;

function Entry(props: {
  row: MeasurementRow;
  access: { api: string; token: Token; specimenId: string };
}) {
  const { row } = props;
  return (
    <div className={`${CARD_CLASSES} grid gap-1`}>
      <p className="font-semibold">
        {valueText(row.value)} · {dateText(row.date)}
      </p>
      <p className="text-muted-foreground">{QUALITY_NAME[row.quality]}</p>
      {row.note ? <p className="text-muted-foreground">{row.note}</p> : null}
      {row.photo ? (
        <MeasurementPhoto {...props.access} measurementId={row.id} date={row.date} compact />
      ) : null}
    </div>
  );
}

/**
 * "Verlauf" of the plant layer (US-QS-23): the measurements with their photos, newest first (the server sorts), as
 * pages with the pager. The page has its own address part, so the list behind the layer keeps its page. Without a
 * measurement the tab says what to do next (P-09).
 */
export function PlantHistory(props: {
  api: string;
  token: Token;
  specimenId: string;
  /** Leaves the layer and opens the measuring. */
  onMeasure?: () => void;
}) {
  const { api, token, specimenId } = props;
  const key = useMemo(() => ["care", "measurements", specimenId], [specimenId]);
  const load = useCallback(
    (t: string) => loadMeasurementView(api, t, specimenId),
    [api, specimenId],
  );
  const loading = "Verlauf wird geladen …";
  return (
    <LoadFrame
      queryKey={key}
      token={token}
      load={load}
      loadingText={loading}
      loadingFallback={
        <p role="status" className="text-sm text-muted-foreground">
          {loading}
        </p>
      }
      empty={{
        isEmpty: (view) => view.measurements.length === 0,
        title: "Noch keine Messung",
        description: "Trage die erste Messung ein, dann erscheint sie hier.",
        ...(props.onMeasure ? { action: { label: "Messen", onClick: props.onMeasure } } : {}),
      }}
    >
      {(view) => (
        <Pager
          items={view.measurements}
          pageSize={PAGE_SIZE}
          label="Messungen und Fotos"
          param="verlauf"
          replace
          getKey={(m) => m.id}
          renderItem={(m) => <Entry row={m} access={{ api, token, specimenId }} />}
        />
      )}
    </LoadFrame>
  );
}

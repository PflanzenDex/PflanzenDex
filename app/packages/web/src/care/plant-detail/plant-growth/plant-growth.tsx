import { useCallback, useMemo } from "react";
import type { GrowthTrend } from "@pflanzendex/core";
import { LoadFrame } from "../../../kernel";
import { loadMeasurementView } from "../../shared/api/measurements-api";
import { growthLines } from "../../measure/measurement-header/growth-summary/growth-text";

type Token = () => Promise<string | undefined>;

/** Rate and trend against the own history only, never a species average (P-08, US-WAC-03); etiolated growth is no success. */
function GrowthLines({ growth }: { growth: GrowthTrend }) {
  const lines = growthLines(growth);
  return (
    // One line (US-QS-23); it wraps only when the trend sentence needs more room.
    <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
      <span>Wachstum: {lines.rate}</span>
      <span aria-hidden="true">·</span>
      <span>Trend: {lines.trend || "unbekannt"}</span>
    </p>
  );
}

/**
 * The growth trend of one plant for the overview of the plant layer (US-QS-23). It shares the data of the measure page,
 * so a new measurement shows here at once; it says that it loads, and why it failed with a way to retry (P-10).
 */
export function PlantGrowth(props: { api: string; token: Token; specimenId: string }) {
  const { api, token, specimenId } = props;
  const key = useMemo(() => ["care", "measurements", specimenId], [specimenId]);
  const load = useCallback(
    (t: string) => loadMeasurementView(api, t, specimenId),
    [api, specimenId],
  );
  const loading = "Trend wird geladen …";
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
    >
      {(view) => <GrowthLines growth={view.growth} />}
    </LoadFrame>
  );
}

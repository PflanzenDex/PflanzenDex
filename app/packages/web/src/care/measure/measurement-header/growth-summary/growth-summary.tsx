import type { GrowthTrend } from "@pflanzendex/core";
import { growthLines } from "./growth-text";

/** Rate and trend against the own history (US-WAC-03); never against a species average (P-08). */
export function GrowthSummary({ growth }: { growth: GrowthTrend }) {
  const lines = growthLines(growth);
  return (
    <>
      <div>
        <dt className="font-semibold">Rate</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">{lines.rate}</dd>
      </div>
      <div>
        <dt className="font-semibold">Trend</dt>
        <dd className="m-0 mt-0.5 text-muted-foreground">{lines.trend || "unbekannt"}</dd>
      </div>
    </>
  );
}

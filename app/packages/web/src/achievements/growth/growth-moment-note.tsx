import { dateText } from "@/lib/format";
import type { GrowthMoments } from "./use-growth-moments";

const number = (n: number): string => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/**
 * The quiet growth moment of the measurement result (US-ACH-05): "N cm seit <Datum>" and, if the yearly rate beats the
 * specimen's own earlier best, "Neuer persönlicher Rekord". Only right after a measurement was saved (`justSaved`), so it
 * is not repeated at every visit. Unknown stays unknown and says what is needed (P-08, P-09); etiolated or slower growth
 * shows nothing (US-WAC-04). Only the own history is compared, never other specimens or keepers.
 */
export function GrowthMomentNote(props: { moments: GrowthMoments | null; justSaved: boolean }) {
  const { moments } = props;
  if (!moments || !props.justSaved) return null;
  const m = moments.latest;
  if (m.kind === "none") return null;
  if (m.kind === "unknown") {
    return (
      <p role="status" className="m-0 text-sm text-muted-foreground">
        Wachstumsmoment: unbekannt. Dafür braucht es mindestens zwei Messungen im Abstand von 90
        Tagen.
      </p>
    );
  }
  return (
    <p role="status" className="m-0 rounded-lg border border-border p-3">
      {`Wachstumsmoment: ${number(m.growth)} cm seit ${dateText(m.since)}.`}
      {m.record && ` Neuer persönlicher Rekord: ${number(m.record.ratePerYear)} cm/Jahr.`}
    </p>
  );
}

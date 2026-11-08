import { dateText, keepTogether } from "@/shared/lib/format";
import { texts } from "@/shared/lib/text-rules/texts";
import type { GrowthMoments } from "../use-growth-moments";
import table from "./growth-moment-note.de.json";

const t = texts(table);

const number = (n: number): string => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/**
 * The text of the quiet growth moment of the measurement result (US-ACH-05): "N cm seit <Datum>" and, if the yearly rate
 * beats the specimen's own earlier best, "Neuer persönlicher Rekord". `null` when there is nothing to say. Only right
 * after a measurement was saved (`justSaved`), so it is not repeated at every visit. Unknown stays unknown and says what
 * is needed (P-08, P-09); etiolated or slower growth shows nothing (US-WAC-04). Only the own history is compared, never
 * other specimens or keepers. The caller shows and announces the text (issue 1644, DS-54).
 */
export function growthNoteText(props: {
  moments: GrowthMoments | null;
  justSaved: boolean;
}): string | null {
  const { moments } = props;
  if (!moments || !props.justSaved) return null;
  const m = moments.latest;
  if (m.kind === "none") return null;
  if (m.kind === "unknown") return t("unknown");
  const growth = t("growth", { growth: number(m.growth), since: dateText(m.since) });
  return keepTogether(
    m.record ? `${growth} ${t("record", { rate: number(m.record.ratePerYear) })}` : growth,
  );
}

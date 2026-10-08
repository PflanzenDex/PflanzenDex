import type { GrowthTrend, Trend } from "@pflanzendex/core";

export const TREND_TEXT: Record<Trend, string> = {
  faster: "schneller als dein bisheriger Schnitt",
  slower: "langsamer als dein bisheriger Schnitt",
  stable: "stabil",
};

/** "36,5 cm/Jahr": measures are in centimeters (US-WAC-01). */
export const rateText = (perYear: number): string =>
  `${perYear.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm/Jahr`;

export interface GrowthLines {
  readonly rate: string;
  readonly trend: string;
}

export const ETIOLATED_TEXT =
  "Wuchs vergeilt/dünn — trotz Rate kein Erfolgssignal, siehe Erfolgskriterien";

/** What the view says about rate and trend; "unknown" where the data does not reach (P-08). */
export function growthLines(g: GrowthTrend): GrowthLines {
  const lines = rateAndTrend(g);
  if (g.signal === "etiolated") return { ...lines, trend: ETIOLATED_TEXT };
  if (g.signal === "success") return { ...lines, trend: `${lines.trend} (Erfolgssignal)` };
  return lines;
}

function rateAndTrend(g: GrowthTrend): GrowthLines {
  if (g.count === 0) return { rate: "noch keine Messung", trend: "" };
  if (g.count === 1) return { rate: "1 Messung — noch keine Rate", trend: "" };
  if (g.ratePerYear === null)
    return { rate: "noch keine Rate: die Messungen liegen am selben Tag", trend: "" };
  const rate = rateText(g.ratePerYear);
  if (g.trend) return { rate, trend: TREND_TEXT[g.trend] };
  if (g.count === 2) return { rate, trend: "ab der 3. Messung siehst du hier einen Trend" };
  return { rate, trend: "noch kein Trend: zu wenige Messungen an verschiedenen Tagen" };
}

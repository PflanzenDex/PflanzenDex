import type { ReactNode } from "react";
import type { GrowthTrend, Trend } from "@pflanzendex/core";
import { NBSP, texts } from "@/shared/lib/text-rules/texts";
import {
  TREND_TEXT,
  growthLines,
} from "../../../measure/measurement-header/growth-summary/growth-text";
import table from "../plant-growth.de.json";

const t = texts(table);

/** Wachstum and trend against the own history only, never a species average (P-08, US-WAC-03); etiolated growth is no success. */
export function GrowthLines({ growth }: { growth: GrowthTrend }) {
  const lines = growthLines(growth);
  return (
    // One line (US-QS-23); it wraps only when the trend sentence needs more room.
    <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
      <span>{t("rate", { rate: lines.rate })}</span>
      {/* The dot sticks to the trend (US-QS-32): a line never ends with " ·" and the trend starts the next line. */}
      <span>
        <span aria-hidden="true">·{NBSP}</span>
        {t("trend", { trend: lines.trend || t("unknown") })}
      </span>
    </p>
  );
}

/** The rate of the samples: a wide one, so the longest wording of the rate keeps its room (US-QS-32). */
const SAMPLE_RATE = 999.9;
const TRENDS = Object.keys(TREND_TEXT) as Trend[];

/**
 * The growth readings the frame reserves (US-QS-32): one sample for each reading that `growthTrend` can derive from a course
 * with the rate of `SAMPLE_RATE`, and each trend with and without the success signal. The texts come from `growthLines`,
 * never copied here; a test checks that every reading of a derived course is one of these.
 */
const SAMPLES: readonly GrowthTrend[] = [
  // No rate: no measurement, one measurement (its etiolation counts), or two on the same day.
  { count: 0, ratePerYear: null, trend: null, signal: null },
  { count: 1, ratePerYear: null, trend: null, signal: null },
  { count: 1, ratePerYear: null, trend: null, signal: "etiolated" },
  { count: 2, ratePerYear: null, trend: null, signal: null },
  { count: 2, ratePerYear: null, trend: null, signal: "etiolated" },
  // A rate from two measurements: the hint for the third one, or etiolated growth.
  { count: 2, ratePerYear: SAMPLE_RATE, trend: null, signal: null },
  { count: 2, ratePerYear: SAMPLE_RATE, trend: null, signal: "etiolated" },
  // Three or more: no usable trend yet, each trend with and without the success signal, or etiolated.
  { count: 3, ratePerYear: SAMPLE_RATE, trend: null, signal: null },
  ...TRENDS.flatMap((trend): GrowthTrend[] => [
    { count: 3, ratePerYear: SAMPLE_RATE, trend, signal: null },
    { count: 3, ratePerYear: SAMPLE_RATE, trend, signal: "success" },
  ]),
  { count: 3, ratePerYear: SAMPLE_RATE, trend: "faster", signal: "etiolated" },
];

/** The key of a reading: its rate and trend as `growthLines` words them. */
export function readingKey(growth: GrowthTrend): string {
  const lines = growthLines(growth);
  return `${lines.rate}\u0000${lines.trend}`;
}

/** The samples with one copy per wording, so the frame holds each reading once. */
function distinctReadings(samples: readonly GrowthTrend[]): GrowthTrend[] {
  const seen = new Set<string>();
  return samples.filter((sample) => {
    const key = readingKey(sample);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const GROWTH_READINGS: readonly GrowthTrend[] = distinctReadings(SAMPLES);

/**
 * The hidden copy of a reading: the two spans of `GrowthLines`, with their texts in attributes that CSS draws
 * (`before:content-[attr(data-reading)]`). The copy holds no text node, so a text query finds only the visible line, and
 * the generated text wraps like the real one (US-QS-32). The attribute values are the texts `GrowthLines` shows.
 */
function ReadingCopy({ growth }: { growth: GrowthTrend }) {
  const lines = growthLines(growth);
  return (
    <div aria-hidden="true" className="invisible col-start-1 row-start-1">
      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        <span
          data-reading={t("rate", { rate: lines.rate })}
          className="before:content-[attr(data-reading)]"
        />
        <span
          data-reading={`·${NBSP}${t("trend", { trend: lines.trend || t("unknown") })}`}
          className="before:content-[attr(data-reading)]"
        />
      </p>
    </div>
  );
}

/**
 * The growth line in the height of its longest reading (US-QS-32): every reading is drawn invisibly in one cell, and the
 * visible content shares that cell. The line keeps the height it reserves in every state (loading, loaded, unknown, error),
 * so nothing moves when the trend arrives. The copies are hidden from assistive technology and cannot be focused.
 */
export function GrowthFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      {GROWTH_READINGS.map((reading) => (
        <ReadingCopy key={readingKey(reading)} growth={reading} />
      ))}
      <div className="col-start-1 row-start-1 min-w-0">{children}</div>
    </div>
  );
}

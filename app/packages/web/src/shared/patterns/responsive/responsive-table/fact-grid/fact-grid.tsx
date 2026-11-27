import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { DisclosureSummary } from "@/shared/ui/more-help.disclosure-summary";

/**
 * One label and its value. A value is unknown when it is `null`, `undefined`, `false`, or a string that is empty or
 * whitespace only (P-08): unknown values are never printed, they fold. Labels should be unique within one `facts`
 * list; keys and the fold use them.
 */
export type Fact = { label: string; value: React.ReactNode | null };

/** True when a value counts as unknown: `null`, `undefined`, `false`, "" or whitespace only (P-08, US-QS-24). */
export const isUnknown = (value: React.ReactNode): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  (typeof value === "string" && value.trim() === "");

export type FactGridProps = {
  facts: readonly Fact[];
  /** The words of the fold for a count of unknown facts; the default is "1 Angabe fehlt" (US-QS-24, US-QS-32). */
  countText?: (count: number) => string;
  /**
   * The next step for the unknown facts (P-09): an opener or a link of the caller, e.g. a `LayerOpener` or a link to
   * the species profile. Without one a neutral sentence says what to do.
   */
  next?: React.ReactNode;
  className?: string;
};

/** The fold line of unknown facts with its German plural: "1 Angabe fehlt", "12 Angaben fehlen" (US-QS-24). */
export const missingText = (count: number): string =>
  count === 1 ? "1\u00a0Angabe fehlt" : `${count}\u00a0Angaben fehlen`;

/**
 * The known facts as a compact label/value grid; the unknown ones fold into ONE line with their count, their names
 * behind the count and the next step beside it (US-QS-24, P-08, P-09, P-10). A view with no unknown fact shows no line.
 */
export function FactGrid({ facts, next, className, countText = missingText }: FactGridProps) {
  const known = facts.filter((f) => !isUnknown(f.value));
  const unknown = facts.filter((f) => isUnknown(f.value)).map((f) => f.label);
  return (
    <div className={cn("@container grid min-w-0 gap-2 text-sm", className)}>
      {known.length > 0 ? (
        // The value column may shrink below its longest word, so a long value wraps and never runs past the panel (issue 1019).
        // `anywhere` on the list lowers the min-content of the `auto` label column (issue 1019). The value itself breaks only
        // inside a word longer than the column (`break-word` on the cell, F-0228, US-QS-32).
        // In a box narrower than 12 rem (a container query in rem, so it follows the text size) each label stands above its
        // value: at 200 % text the label column alone takes the room of the value, which then ran past the box (US-QS-15, issue 1180).
        <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-2 [overflow-wrap:anywhere] @min-[12rem]:grid-cols-[auto_minmax(0,1fr)]">
          {known.map((f, index) => (
            <div key={`${index}-${f.label}`} className="contents">
              <dt className="font-semibold">{f.label}</dt>
              <dd className="m-0 [overflow-wrap:break-word]">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {unknown.length > 0 ? (
        <UnknownFold labels={unknown} next={next} countText={countText} />
      ) : null}
    </div>
  );
}

/** The neutral next step of a fold without one of its own (P-09, US-QS-24). */
export function FoldNext() {
  return <span>Ergänzen, sobald du die Angaben kennst.</span>;
}

/** One line: the count opens the names of the missing facts, the next step stands beside it (US-QS-24). */
function UnknownFold({
  labels,
  next,
  countText,
}: {
  labels: readonly string[];
  next?: React.ReactNode;
  countText: (count: number) => string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-muted-foreground">
      <details className="min-w-0">
        {/* `relative`: the sr-only name list is absolutely positioned; without a positioned box it escapes an inner scroll region and makes the page scroll (US-QS-15, DS-61). */}
        <DisclosureSummary className="relative inline-flex w-auto gap-2 rounded-sm tabular-nums focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span>{countText(labels.length)}</span>
          <span className="sr-only"> (Namen anzeigen)</span>
        </DisclosureSummary>
        <p className="m-0 break-words pb-2 text-foreground">{labels.join(", ")}</p>
      </details>
      <span aria-hidden="true">·</span>
      {next ?? <FoldNext />}
    </div>
  );
}

/**
 * The labels of the facts that are unknown for every row (US-QS-24): a view hides such a column and names it once
 * instead of printing an "unbekannt" per row (P-10 keeps it visible). Labels should be unique within a row.
 */
export function unknownInEvery<Row>(
  rows: readonly Row[],
  facts: (row: Row) => readonly Fact[],
): string[] {
  const all = rows.map((row) => facts(row));
  const labels = [...new Set(all.flatMap((fs) => fs.map((f) => f.label)))];
  const knownIn = (fs: readonly Fact[], label: string) =>
    fs.some((f) => f.label === label && !isUnknown(f.value));
  return labels.filter((label) => !all.some((fs) => knownIn(fs, label)));
}

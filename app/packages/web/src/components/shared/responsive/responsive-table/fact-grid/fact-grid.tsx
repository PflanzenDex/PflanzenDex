import * as React from "react";
import { cn } from "@/lib/utils";

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
  /**
   * The next step for the unknown facts (P-09): an opener or a link of the caller, e.g. a `LayerOpener` or a link to
   * the species profile. Without one a neutral sentence says what to do.
   */
  next?: React.ReactNode;
  className?: string;
};

/** The fold line of unknown facts with its German plural: "1 Angabe fehlt", "12 Angaben fehlen" (US-QS-24). */
export const missingText = (count: number): string =>
  count === 1 ? "1 Angabe fehlt" : `${count} Angaben fehlen`;

/**
 * The known facts as a compact label/value grid; the unknown ones fold into ONE line with their count, their names
 * behind the count and the next step beside it (US-QS-24, P-08, P-09, P-10). A view with no unknown fact shows no line.
 */
export function FactGrid({ facts, next, className }: FactGridProps) {
  const known = facts.filter((f) => !isUnknown(f.value));
  const unknown = facts.filter((f) => isUnknown(f.value)).map((f) => f.label);
  return (
    <div className={cn("grid min-w-0 gap-2 text-sm", className)}>
      {known.length > 0 ? (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 break-words">
          {known.map((f, index) => (
            <div key={`${index}-${f.label}`} className="contents">
              <dt className="font-semibold">{f.label}</dt>
              <dd className="m-0">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {unknown.length > 0 ? <UnknownFold labels={unknown} next={next} /> : null}
    </div>
  );
}

/** One line: the count opens the names of the missing facts, the next step stands beside it (US-QS-24). */
function UnknownFold({ labels, next }: { labels: readonly string[]; next?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
      <details className="min-w-0">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center rounded-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <span>{missingText(labels.length)}</span>
          <span className="sr-only"> (Namen anzeigen)</span>
        </summary>
        <p className="m-0 break-words pb-2 text-foreground">{labels.join(", ")}</p>
      </details>
      <span aria-hidden="true">·</span>
      {next ?? <span>Ergänzen, sobald du die Angaben kennst.</span>}
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

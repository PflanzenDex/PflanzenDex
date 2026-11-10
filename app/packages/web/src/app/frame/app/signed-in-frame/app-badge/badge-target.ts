// US-QS-29 · The number of the app icon as a rule, without the browser: the total of "Heute" or nothing.

/**
 * The three categories of the summary of "Heute" (US-QS-18): the plants due for watering, the open treatments (the overdue
 * ones are among them) and the hints "Fehlt noch". `undefined` while a category loads or failed.
 */
export type BadgeCounts = {
  watering: number | undefined;
  treatments: number | undefined;
  hints: number | undefined;
};

/** The total of the three categories; `undefined` while one of them is not known, so no partial number is shown (P-08). */
export function badgeTotal(counts: BadgeCounts): number | undefined {
  const { watering, treatments, hints } = counts;
  if (watering === undefined || treatments === undefined || hints === undefined) return undefined;
  return watering + treatments + hints;
}

/**
 * What the icon shows: a number, `"clear"` for no number, or `"wait"` while a setting or a count is not known, so the icon
 * keeps what it shows.
 */
export type BadgeTarget = number | "clear" | "wait";

/**
 * Calm mode on (US-ACH-08) or every reminder switch off (P-12) means no number, whatever the counts are. Otherwise the
 * icon waits for the settings and the total, and a total of 0 clears it.
 */
export function badgeTarget(input: {
  calmMode: boolean | undefined;
  remindersOn: boolean | undefined;
  total: number | undefined;
}): BadgeTarget {
  if (input.calmMode === true || input.remindersOn === false) return "clear";
  if (input.calmMode === undefined || input.remindersOn === undefined) return "wait";
  if (input.total === undefined) return "wait";
  return input.total > 0 ? input.total : "clear";
}

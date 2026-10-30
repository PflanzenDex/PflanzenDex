import { checkResearchData, issueLine, type DataCheck, type ResearchFile } from "./check-data.ts";

const two = (n: number) => String(n).padStart(2, "0");
/** The operator's local calendar day (NFR-08): a retrieval date after it is in the future. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/**
 * Checks the data files and reports every issue on `say`; returns the check. Shared by `catalog:check-data` and by
 * `catalog:load`, which refuses to write when an issue is found.
 */
export function checkAndReport(
  files: readonly ResearchFile[],
  startList: readonly string[],
  now: Date,
  say: (line: string) => void,
): DataCheck {
  const check = checkResearchData(files, startList, localDay(now));
  for (const issue of check.issues) say(issueLine(issue));
  say(
    check.issues.length === 0
      ? `Research data ok: ${files.length} files, ${check.species} species, ${check.facts.length} values.`
      : `Research data refused: ${check.issues.length} problems in ${files.length} files.`,
  );
  return check;
}

export interface CheckCliDeps {
  readonly readData: () => readonly ResearchFile[];
  readonly startList: readonly string[];
  readonly out: (line: string) => void;
  readonly now: () => Date;
}

/** `npm run catalog:check-data` (US-ENT-09, #1005): exit 0 when every value passes, otherwise 1 with every problem. */
export function runCheckData(deps: CheckCliDeps): number {
  const check = checkAndReport(deps.readData(), deps.startList, deps.now(), deps.out);
  return check.issues.length === 0 ? 0 : 1;
}

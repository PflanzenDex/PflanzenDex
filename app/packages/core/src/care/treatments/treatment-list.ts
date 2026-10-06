import { appError, failed, isTimeZone, localToday, ok, type Result } from "../../kernel";
import { isActive, type SpecimenStore } from "../../collection";
import { daysBetween } from "../treatment-data/treatment-dates";
import type { TreatmentRow, TreatmentStore } from "../treatment-data/treatment-types";

export type TreatmentStatusKind = "overdue" | "today" | "soon" | "later";

/** How urgent a due date is (US-BEH-02); derived on every request, never stored (P-01). */
export interface TreatmentStatus {
  readonly kind: TreatmentStatusKind;
  /** Days overdue (kind overdue), else days until the due date; never negative. */
  readonly days: number;
  readonly text: string;
}

export interface TreatmentListDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly treatments: Pick<TreatmentStore, "open">;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

/** A row of the list of open treatments (US-BEH-02). */
export interface TreatmentListRow {
  readonly id: string;
  readonly specimenId: string;
  readonly specimenName: string;
  readonly reason: string;
  /** `null` = no agent given (shown as "—"). */
  readonly agent: string | null;
  /** Local calendar date `YYYY-MM-DD`. */
  readonly dueAt: string;
  readonly status: TreatmentStatus;
}

const SOON_DAYS = 3;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** `YYYY-MM-DD` as "03.10.2026"; a calendar date, no time zone involved (NFR-08). */
const germanDate = (iso: string): string => iso.split("-").reverse().join(".");

/**
 * Status of a due date against the user's local `today` (US-BEH-02): "überfällig seit N Tag(en)" (< 0), "heute
 * fällig" (0), "in N Tagen" (1 to 3), otherwise the date. Pure calendar arithmetic (NFR-08).
 */
export function treatmentStatus(dueAt: string, today: string): TreatmentStatus {
  const diff = daysBetween(today, dueAt);
  if (diff < 0)
    return {
      kind: "overdue",
      days: -diff,
      text: `überfällig seit ${plural(-diff, "Tag", "Tagen")}`,
    };
  if (diff === 0) return { kind: "today", days: 0, text: "heute fällig" };
  if (diff <= SOON_DAYS)
    return { kind: "soon", days: diff, text: `in ${plural(diff, "Tag", "Tagen")}` };
  return { kind: "later", days: diff, text: germanDate(dueAt) };
}

const byDate = (a: TreatmentListRow, b: TreatmentListRow): number =>
  a.dueAt.localeCompare(b.dueAt) ||
  a.specimenName.localeCompare(b.specimenName, "de") ||
  a.id.localeCompare(b.id);

/**
 * The open treatments of the account, earliest first (US-BEH-02). Archived specimens have none (their ids are never
 * asked, US-BES-07); done treatments never appear. `today` is the date in `timeZone`, never the UTC date (NFR-08).
 * Only the own specimens are asked, so a foreign treatment cannot appear (P-04).
 */
export async function treatmentOpenList(
  deps: TreatmentListDependencies,
  userId: string,
  timeZone: unknown,
): Promise<Result<readonly TreatmentListRow[]>> {
  if (!isTimeZone(timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const today = localToday(deps.clock(), timeZone);
  const active = (await deps.specimens.list(userId)).filter(isActive);
  const open = await deps.treatments.open(
    userId,
    active.map((z) => z.id),
  );
  const rows = active.flatMap((z) =>
    (open.get(z.id) ?? []).map((t: TreatmentRow): TreatmentListRow => ({
      id: t.id,
      specimenId: z.id,
      specimenName: z.name,
      reason: t.reason,
      agent: t.agent,
      dueAt: t.dueAt,
      status: treatmentStatus(t.dueAt, today),
    })),
  );
  return ok(rows.sort(byDate));
}

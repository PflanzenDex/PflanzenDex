import { classifyDeadlines, deadlineHealth, type DeadlineHealth } from "@pflanzendex/core";
import { DeletionQueuePostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/** The deadline state of the open deletions for the health details (US-ACC-04, US-DEV-03). Counts only, no subject. */
export interface DeletionDeadlineCheck {
  readonly status: DeadlineHealth;
  readonly near: number;
  readonly past: number;
  /** Finished deletions whose identity is still open (the job did not remove it, or it is not configured). */
  readonly identityOpen: number;
}

/**
 * Reads every open item through the owner connection and classifies it against `now`. A passed deadline is reported as
 * `deadline_passed` (the record of the incident while the application has no incident tool, P-10).
 */
export async function deletionDeadlineCheck(pool: Pool, now: Date): Promise<DeletionDeadlineCheck> {
  const rows = await new DeletionQueuePostgres(pool).openItems();
  const report = classifyDeadlines(
    rows.map((row) => ({ ...row, done: false })),
    now,
  );
  return {
    status: deadlineHealth(report),
    near: report.near.length,
    past: report.past.length,
    identityOpen: rows.filter((row) => row.kind === "identity").length,
  };
}

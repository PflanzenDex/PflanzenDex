import { appError, failed, isId, ok, type Result } from "../../kernel";
import type { ReviewStore } from "../types";
import {
  CORRECTION_FIELDS,
  type Correction,
  type CorrectionEntry,
  type CorrectionField,
  type CorrectionStore,
  type FieldVersion,
  type OpenCorrection,
} from "./types";

export interface CorrectionReviewList {
  readonly open: number;
  readonly entries: readonly CorrectionEntry[];
}

/**
 * Open corrections for the review list (US-BES-16) with the counts of confirmations and disputes (US-BES-15): more
 * confirmations first, then oldest first; reviewers only. The votes only order the list, a reviewer decides (E-26).
 */
export async function catalogCorrections(
  store: CorrectionStore,
  review: ReviewStore,
  userId: string | null,
): Promise<Result<CorrectionReviewList>> {
  if (userId === null) return failed(appError("access.not_signed_in"));
  if ((await review.roles(userId)).length === 0) return failed(appError("access.denied"));
  const entries = await store.listOpen(userId);
  const sorted = [...entries].sort((a, b) => b.confirmations - a.confirmations);
  return ok({ open: sorted.length, entries: sorted });
}

/** The caller's own corrections with status and decision reason (the hint of the result, P-09, P-10). */
export async function myCorrections(
  store: CorrectionStore,
  userId: string | null,
): Promise<Result<readonly Correction[]>> {
  if (userId === null) return failed(appError("access.not_signed_in"));
  return ok(await store.listMine(userId));
}

/**
 * Every version of a field with value, source, origin and date, newest first (US-BES-16). The account that set a
 * value is shown to reviewers only (P-05).
 */
export async function catalogFieldHistory(
  store: CorrectionStore,
  review: ReviewStore,
  userId: string | null,
  target: { readonly speciesId: string; readonly field: string },
): Promise<Result<readonly FieldVersion[]>> {
  const { speciesId, field } = target;
  if (userId === null) return failed(appError("access.not_signed_in"));
  if (!isId(speciesId) || !(CORRECTION_FIELDS as readonly string[]).includes(field)) {
    return failed(
      appError("input.invalid", { details: [{ field: "field", code: "input.invalid" }] }),
    );
  }
  const versions = await store.history(userId, speciesId.toLowerCase(), field as CorrectionField);
  if (!versions) return failed(appError("species.not_found"));
  const reviewer = (await review.roles(userId)).length > 0;
  return ok(reviewer ? versions : versions.map((v) => ({ ...v, setBy: null })));
}

/**
 * The open corrections of an approved species with counts and the caller's own vote, so a keeper can confirm a
 * proposal instead of duplicating it (US-BES-14, US-BES-15). An unknown or private species answers like a missing one.
 */
export async function speciesCorrections(
  store: CorrectionStore,
  userId: string | null,
  speciesId: string,
): Promise<Result<readonly OpenCorrection[]>> {
  if (userId === null) return failed(appError("access.not_signed_in"));
  if (!isId(speciesId)) {
    return failed(
      appError("input.invalid", { details: [{ field: "speciesId", code: "input.invalid" }] }),
    );
  }
  const rows = await store.listForSpecies(userId, speciesId.toLowerCase());
  return rows ? ok(rows) : failed(appError("species.not_found"));
}

import type { AppError, ErrorCode } from "@pflanzendex/core";

type Status = 400 | 401 | 403 | 404 | 409 | 500;

// Stable mapping of error code -> HTTP status (FR-QG-11). Unknown codes are a server error, never a success.
const STATUS: Partial<Record<ErrorCode, Status>> = {
  "input.invalid": 400,
  "idempotency.key_missing": 400,
  "operator_cost.month_in_future": 400,
  "access.not_signed_in": 401,
  "access.denied": 403,
  "invitation.invalid": 403,
  "invitation.required": 403,
  "light_zone.not_found": 404,
  "location.not_found": 404,
  "review.not_found": 404,
  "species.not_found": 404,
  "specimen.caught_in_future": 400,
  "specimen.not_found": 404,
  "treatment.not_found": 404,
  "care.no_phase": 409,
  "care.target_unknown": 409,
  "review.already_exists": 409,
  "review.status_invalid": 409,
  "review.merge_lock_failed": 409,
  "review.reason_missing": 400,
  "review.approval_incomplete": 409,
  "review.merge_target_invalid": 409,
  "review.merge_conflict": 409,
  "species.duplicate": 409,
  "specimen.name_taken": 409,
  "wish.name_taken": 409,
  "wish.not_found": 404,
  "wish.not_open": 409,
  "specimen.marker_taken": 409,
  "specimen.marker_required": 409,
  "specimen.markers_missing": 409,
  "specimen.already_archived": 409,
  "specimen.not_a_cutting": 409,
  "specimen.not_archived": 409,
  "specimen.archived": 409,
  "specimen.caught_after_archived": 409,
  "light_zone.name_taken": 409,
  "location.name_taken": 409,
  "light_zone.in_use": 409,
  "light_zone.not_empty": 409,
  "idempotency.key_conflict": 409,
  "idempotency.in_progress": 409,
};

export const statusFor = (f: AppError): Status => STATUS[f.code] ?? 500;

/** Response body: code for programs, text for humans, `data` e.g. with the users of a zone. Never the cause. */
export const errorBody = (f: AppError) => ({
  error: {
    code: f.code,
    text: f.text,
    ...(f.details ? { details: f.details } : {}),
    ...(f.data !== undefined ? { data: f.data } : {}),
  },
});

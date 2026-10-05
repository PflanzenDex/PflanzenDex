// Public interface of the `kernel` module (operations engine, result, error, ports).
export * from "./meta";
export { ERROR_TEXTS, ERROR_CODE_FORMAT, appError } from "./error";
export type { AppError, ErrorCode, ErrorDetail } from "./error";
export { failed, ok } from "./result";
export type { Result } from "./result";
export {
  identifierField,
  integerField,
  isId,
  idField,
  idListField,
  shape,
  orNull,
  textField,
  choiceField,
  numberField,
  timeZoneField,
  calendarDateField,
} from "./input";
export type { Schema } from "./input";
export { defineOperation, execute } from "./operation";
export type { Dependencies, Call, Operation } from "./operation";
export { canonical } from "./input";
export type { SignedInContext, Begin, IdempotencyKey, IdempotencyStore, Context } from "./ports";
export { localToday, isTimeZone, isCalendarDate } from "./date";
export * from "./sources";

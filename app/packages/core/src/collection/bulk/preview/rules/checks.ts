// The checks of one row of an import (US-BES-18), each under the rule of the field it becomes: the nickname is the marker
// (US-BES-03), the location is matched or new (US-LIC-05), the purchase date is the catch date (FR-BES-04) and the notes
// are the private notes (US-BES-18). The same schemas as on creation decide, so a row cannot pass where a creation would fail.
import {
  calendarDateField,
  normalizeName,
  textField,
  type ErrorCode,
  type ErrorDetail,
} from "../../../../kernel";
import { LIGHT_LIMITS, type LightLocation } from "../../../../light";
import { notesField } from "../../../notes/notes";
import { SPECIMEN_LIMITS } from "../../../shared/types";
import type { ImportDate, ParsedRow } from "../../types";

/** Why a row is flagged: a code the web translates, and the column it concerns. */
export interface Reason {
  readonly code: ErrorCode;
  readonly field: string;
  readonly data?: unknown;
}

/** The location of a row: an existing one (`id`) or a new one, created on confirmation only. */
export interface LocationMatch {
  readonly id: string | null;
  readonly name: string;
  readonly isNew: boolean;
}

/** The values a row would write, as far as they are valid; `null` where the row says none (empty means today's default). */
export interface RowValues {
  readonly marker: string | null;
  readonly catchDate: string | null;
  readonly notes: string | null;
  readonly location: LocationMatch | null;
}

interface Checked<T> {
  readonly value: T;
  readonly reason: Reason | null;
}

const isDetail = (value: unknown): value is ErrorDetail =>
  typeof value === "object" && value !== null && "code" in value;

const flag = (code: ErrorCode, field: string): Reason => ({ code, field });
const clean = <T>(value: T): Checked<T> => ({ value, reason: null });
const refused = <T>(reason: Reason): Checked<T | null> => ({ value: null, reason });

function checkMarker(nickname: string | null): Checked<string | null> {
  if (nickname === null) return clean(null);
  const checked = textField("nickname", SPECIMEN_LIMITS.marker)(nickname);
  return isDetail(checked) ? refused(flag("input.invalid", "nickname")) : clean(checked);
}

function checkLocation(
  name: string | null,
  locations: readonly LightLocation[],
): Checked<LocationMatch | null> {
  if (name === null) return clean(null);
  const checked = textField("location", LIGHT_LIMITS.name)(name);
  const want = normalizeName(name);
  if (isDetail(checked) || want === "") return refused(flag("input.invalid", "location"));
  const known = locations.find((l) => normalizeName(l.name) === want);
  return clean(
    known
      ? { id: known.id, name: known.name, isNew: false }
      : { id: null, name: checked, isNew: true },
  );
}

function checkDate(date: ImportDate, today: string): Checked<string | null> {
  if (date.kind === "absent") return clean(null);
  if (date.kind === "invalid") return refused(flag("input.invalid", "purchaseDate"));
  const checked = calendarDateField("purchaseDate")(date.value);
  if (isDetail(checked)) return refused(flag("input.invalid", "purchaseDate"));
  // "Future" is measured against the keeper's local today (NFR-08), like on creation (FR-BES-04).
  if (checked > today) return refused(flag("specimen.caught_in_future", "purchaseDate"));
  return clean(checked);
}

function checkNotes(notes: string | null): Checked<string | null> {
  const checked = notesField("notes")(notes);
  return isDetail(checked) ? refused(flag("input.invalid", "notes")) : clean(checked);
}

/** The values of one row and the reasons it is flagged (empty when the row is clean so far). */
export function checkRow(
  row: ParsedRow,
  today: string,
  locations: readonly LightLocation[],
): { readonly values: RowValues; readonly reasons: readonly Reason[] } {
  const marker = checkMarker(row.nickname);
  const location = checkLocation(row.location, locations);
  const date = checkDate(row.purchaseDate, today);
  const notes = checkNotes(row.notes);
  const reasons = [marker, location, date, notes].flatMap((c) => (c.reason ? [c.reason] : []));
  return {
    values: {
      marker: marker.value,
      location: location.value,
      catchDate: date.value,
      notes: notes.value,
    },
    reasons,
  };
}

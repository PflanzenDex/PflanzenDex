import { useEffect } from "react";
import { localToday } from "@pflanzendex/core";
import { currentTimeZone, type ApiError } from "../kernel";

/** Field name and element IDs of the catch date (US-BES-02, FR-BES-04). */
export const CATCH_DATE_ID = "catch-date";
const HINT_ID = "catch-date-hint";
export const CATCH_DATE_ERROR_ID = "catch-date-error";

/** True when the server refused the catch date itself (field `catchDate`). */
export const refusesCatchDate = (error: ApiError | null): boolean =>
  error?.details?.some((d) => d.field === "catchDate") ?? false;

/**
 * The keeper's local today (profile time zone, NFR-08), the preset and upper limit of the field. A refused catch date
 * takes the keeper to the field, so that a screen reader user lands where the problem is.
 */
export function useCatchDate(error: ApiError | null): string {
  useEffect(() => {
    if (refusesCatchDate(error)) document.getElementById(CATCH_DATE_ID)?.focus();
  }, [error]);
  return localToday(new Date(), currentTimeZone());
}

/**
 * The catch date of the new specimen (FR-BES-04): preset to the keeper's local today, never later than today. An
 * earlier date is allowed for a plant the keeper already owned. A refusal marks the field (visible border via
 * `aria-invalid`) and points at the error text (`aria-describedby`).
 */
export function CatchDateField(props: { today: string; error: ApiError | null }) {
  const invalid = refusesCatchDate(props.error);
  return (
    <>
      <label>
        Fangdatum
        <input
          id={CATCH_DATE_ID}
          name="catchDate"
          type="date"
          defaultValue={props.today}
          max={props.today}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${HINT_ID} ${CATCH_DATE_ERROR_ID}` : HINT_ID}
        />
      </label>
      <p id={HINT_ID} className="quiet">
        Voreingestellt ist heute. Hast du die Pflanze schon länger, trage hier ein früheres Datum
        ein; ein Datum in der Zukunft geht nicht.
      </p>
      {invalid && props.error && (
        <p id={CATCH_DATE_ERROR_ID} role="alert" className="warning">
          {props.error.text}
        </p>
      )}
    </>
  );
}

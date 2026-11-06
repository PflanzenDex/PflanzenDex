import type { RefObject } from "react";

/**
 * The notices above a form after a save (DS-49, P-10): the status line of the last save, and the alert of a refusal
 * that names no field; the alert takes the focus through `alertRef`. The caller leaves `message` out while a refusal
 * stands.
 */
export function FormNotices(props: {
  message: string | null;
  alertText: string | null;
  alertRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {props.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {props.alertText !== null && (
        <div
          role="alert"
          tabIndex={-1}
          ref={props.alertRef}
          className="rounded-lg border border-destructive p-3 text-destructive"
        >
          <p>{props.alertText}</p>
        </div>
      )}
    </>
  );
}

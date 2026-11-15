import type { RefObject } from "react";
import { Banner } from "@/shared/patterns/states/banner/banner";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./form-notices.de.json";

const t = texts(table);

/**
 * The notices above a form after a save (DS-49, P-10): the status line of the last save, and the alert of a refusal
 * that names no field; the alert takes the focus through `alertRef`. The refusal is the one error tone (SG-COLOR-04,
 * SG-STATE-03): red border and error mark. `onRetry` offers "Erneut versuchen" where a retry can help. The caller leaves
 * `message` out while a refusal stands.
 */
export function FormNotices(props: {
  message: string | null;
  alertText: string | null;
  alertRef: RefObject<HTMLDivElement | null>;
  onRetry?: () => void;
}) {
  return (
    <>
      {props.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {props.message}
        </p>
      )}
      {props.alertText !== null && (
        <Banner
          variant="error"
          tabIndex={-1}
          ref={props.alertRef}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...(props.onRetry ? { action: { label: t("retry"), onClick: props.onRetry } } : {})}
        >
          {props.alertText}
        </Banner>
      )}
    </>
  );
}

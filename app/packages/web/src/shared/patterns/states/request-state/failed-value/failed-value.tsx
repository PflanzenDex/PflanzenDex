import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button";
import table from "./failed-value.de.json";

const ui = texts(table);

/**
 * The one wording of a section whose request failed (US-QS-32, SG-STATE-03, SG-STATE-06): the value reads "Nicht geladen"
 * and "Erneut versuchen" asks again. It is never "unbekannt", which stays for a value that is truly unknown (P-08). Rows of
 * the account index and the deletion card share it, so a failed section reads the same everywhere.
 */
export const NOT_LOADED = ui("notLoaded");

/** The retry of a failed section: the visible text "Erneut versuchen" first, the section's name after it for a screen reader. */
export function RetryFailedLoad({ name, onRetry }: { name: string; onRetry: () => void }) {
  return (
    <Button
      type="button"
      variant="plain"
      size="sm"
      aria-label={ui("retryFor", { name })}
      onClick={onRetry}
    >
      {ui("retry")}
    </Button>
  );
}

/** The value of a failed section (the state text) with its retry beside it. */
export function FailedValue({ name, onRetry }: { name: string; onRetry: () => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{NOT_LOADED}</span>
      <RetryFailedLoad name={name} onRetry={onRetry} />
    </span>
  );
}

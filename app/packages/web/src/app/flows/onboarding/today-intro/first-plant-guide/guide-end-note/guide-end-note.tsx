import type { ApiError } from "@/shared/data";
import { Button } from "@/shared/ui/button/button";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./guide-end-note.de.json";

const t = texts(table);

/**
 * The end of the first-plant guide that the server did not store (US-ONB-01, issue 1803): the guide is left in this visit, and
 * the keeper sees why by the error code and can send the end again. A quiet notice above the tasks (P-09, P-10).
 */
export function GuideEndNote(props: { error: ApiError; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2">
      <div role="alert" className="min-w-0 flex-1">
        <p className="m-0">{t("unsaved")}</p>
        <p className="m-0 text-sm">{refusalText(props.error)}</p>
      </div>
      <Button type="button" variant="ghost" onClick={props.onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

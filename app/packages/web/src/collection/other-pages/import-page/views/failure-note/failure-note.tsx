// A request that failed (US-BES-18, P-10): what the server refused, by its code, and the retry. What the page showed stays.
import type { ApiError } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button/button";
import table from "../../import-page.de.json";

const ui = texts(table);

export function FailureNote(props: { error: ApiError; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-control border border-border p-3">
      <p className="m-0 text-sm">{refusalText(props.error)}</p>
      <p className="m-0 text-sm text-muted-foreground">{ui("failureHint")}</p>
      <div>
        <Button type="button" variant="outline" onClick={props.onRetry}>
          {ui("retry")}
        </Button>
      </div>
    </div>
  );
}

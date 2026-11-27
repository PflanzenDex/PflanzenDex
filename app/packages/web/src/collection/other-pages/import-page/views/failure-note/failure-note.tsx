// A request that failed (US-BES-18, P-10): what the server refused, by its code, and the retry. What the page showed stays.
// A key conflict of the confirmation also offers "Hinweis schließen", which frees the held key (US-QS-03).
import type { ApiError } from "@/shared/data";
import { refusalText } from "@/shared/lib/error-text";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "@/shared/ui/button";
import table from "../../import-page.de.json";

const ui = texts(table);

export function FailureNote(props: { error: ApiError; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-control border border-border p-3">
      <p className="m-0 text-sm">{refusalText(props.error)}</p>
      <p className="m-0 text-sm text-muted-foreground">{ui("failureHint")}</p>
      <div>
        <Button type="button" variant="tinted" onClick={props.onRetry}>
          {ui("retry")}
        </Button>
      </div>
      <RefusalClose error={props.error} />
    </div>
  );
}

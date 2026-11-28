import type { ReviewEntry } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ageText, flagsOf, isBatch } from "../review-text";

/** The layer id of a case: the address holds `?sheet=case-<id>` while it is open (US-QS-15). */
export const caseSheet = (entry: ReviewEntry) => `case-${entry.reviewCase.id}`;

/**
 * One case of the review list as a compact row (US-QS-15): the name, the kind, the age and the flags. A tap opens the
 * case as a layer, where the facts and the decisions are (US-BES-10). The list scrolls and clips what lies outside its rows, so the
 * button takes the radius of the card and its focus ring lies inside it, as in the hit list of the catalog (DS-37, issue 2650).
 */
export function ReviewRow(props: { entry: ReviewEntry; now: number }) {
  const { entry, now } = props;
  const { openLayer } = useLayer(caseSheet(entry));
  const kind = isBatch(entry)
    ? "Betreiber-Charge"
    : `Nutzervorschlag · ${ageText(entry.reviewCase.createdAt, now)}`;
  const flags = flagsOf(entry);
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground">
      <Button
        type="button"
        variant="ghost"
        size="row"
        aria-haspopup="dialog"
        className="grid min-h-14 justify-items-start gap-0 rounded-xl px-3.5 py-2 focus-visible:ring-inset focus-visible:ring-offset-0"
        onClick={(event) => openLayer(event.currentTarget)}
      >
        <span className="break-words text-base font-semibold">
          <i>{entry.species?.latinName ?? "Unbekannte Art"}</i>
        </span>
        <span className="break-words text-sm text-muted-foreground">{kind}</span>
        {flags.length > 0 && (
          <span className="break-words text-sm font-semibold text-foreground">
            {flags.join(" · ")}
          </span>
        )}
      </Button>
    </div>
  );
}

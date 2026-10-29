import type { SpeciesHit, NameField } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Button } from "@/components/ui/button/button";
import { badge, DIFFICULTY, UNKNOWN } from "../../shared/text";

/** Hits per page: three compact rows fit a 360 x 640 px screen with the search above (starting value, assumption; US-QS-21). */
export const HITS_PER_PAGE = 3;

const FOUND: Record<NameField, string> = {
  latin: "lateinischen Namen",
  german: "deutschen Namen",
  english: "englischen Namen",
  synonym: "Synonym",
};

/** The one fact of a row: how it was found when that deviates, a proposal's status, else the difficulty (P-08). */
function fact(t: SpeciesHit): string {
  // Searching by the own Latin/German name is self-evident; explain only what deviates.
  if (t.hit && t.hit.field !== "latin" && t.hit.field !== "german")
    return `Gefunden über ${FOUND[t.hit.field]}: ${t.hit.display}`;
  if (t.reviewStatus === "proposal" || t.reviewStatus === "rejected") return badge(t);
  return `Schwierigkeit: ${DIFFICULTY[t.difficulty] ?? UNKNOWN}`;
}

function Hit({ t, onOpen }: { t: SpeciesHit; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground">
      <Button
        type="button"
        variant="ghost"
        className="grid h-auto min-h-14 w-full justify-items-start gap-0 px-3.5 py-2 text-left font-normal"
        onClick={() => onOpen(t.id)}
      >
        <span className="text-base font-semibold">
          <i>{t.latinName}</i>
        </span>
        <span className="break-words text-sm text-muted-foreground">
          {t.germanName ? `${t.germanName} · ` : ""}
          {fact(t)}
        </span>
      </Button>
    </div>
  );
}

/** A page of compact results (name, scientific name, one fact); the page is in the address (US-QS-21, US-QS-15). */
export function HitList(props: {
  hit: readonly SpeciesHit[];
  onOpen: (id: string) => void;
  /** A changed search text or filter starts at page 1. */
  resetKey: string;
}) {
  return (
    <Pager
      items={props.hit}
      pageSize={HITS_PER_PAGE}
      label="Treffer"
      resetKey={props.resetKey}
      getKey={(t) => t.id}
      renderItem={(t) => <Hit t={t} onOpen={props.onOpen} />}
    />
  );
}

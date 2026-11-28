import { Leaf } from "lucide-react";
import type { SpeciesHit, NameField } from "@pflanzendex/core";
import { metaParts } from "@/shared/lists/grouped-list/row-parts/row-parts.meta";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { Button } from "@/shared/ui/button";
import { badge, difficultyText } from "../../shared/text";

/** Hits per page without a layout: three compact rows fit a 360 x 640 px screen with the search above (starting value, assumption; US-QS-21). With a layout the page takes the free height (issue 1029). */
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
  return `Schwierigkeit: ${difficultyText(t.difficulty)}`;
}

/**
 * The button of a row fills the card and takes its radius, and its focus ring lies inside it (DS-37, US-QS-15, issue 2650): the
 * list scrolls in its own box and clips what lies outside the row, so a ring with an offset (4 px out) would lose its top
 * and its sides. The `row` size has no pill radius, which the class merge could not replace by `rounded-xl`.
 */
const HIT_BUTTON =
  "flex min-h-14 rounded-xl px-3.5 py-2 focus-visible:ring-inset focus-visible:ring-offset-0 @max-[14rem]:px-2";

/**
 * A row narrower than 14rem only happens at a large text size (18.5rem at normal text on a 360 px phone): there the
 * thumbnail slot goes and the padding tightens, so a word like "Schwierigkeit:" never breaks inside (issue 1116).
 */
function Hit({ t, onOpen }: { t: SpeciesHit; onOpen: (id: string) => void }) {
  return (
    <div className="@container rounded-xl border border-border bg-card text-card-foreground">
      <Button
        type="button"
        variant="ghost"
        size="row"
        className={HIT_BUTTON}
        onClick={() => onOpen(t.id)}
      >
        {/* A fixed thumbnail slot keeps every name on the same left edge; species carry no photo yet, so no image is invented. */}
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground @max-[14rem]:hidden"
        >
          <Leaf className="size-5" />
        </span>
        <span className="grid min-w-0 flex-1 justify-items-start gap-0">
          <span className="text-base font-semibold [overflow-wrap:anywhere]">
            <i>{t.latinName}</i>
          </span>
          {/* "German name · fact" breaks only between its two parts, never inside one ("Schwierigkeit: / unbekannt"), like the meta line of an object row (`metaParts`, issues 2606, 2632). */}
          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {metaParts(t.germanName ? `${t.germanName} · ${fact(t)}` : fact(t))}
          </span>
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
    <ScrollEntries
      items={props.hit}
      pageSize={HITS_PER_PAGE}
      fit
      label="Treffer"
      resetKey={props.resetKey}
      getKey={(t) => t.id}
      renderItem={(t) => <Hit t={t} onOpen={props.onOpen} />}
    />
  );
}

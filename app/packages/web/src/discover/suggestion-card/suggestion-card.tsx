import type { Suggestion } from "@pflanzendex/core";
import { useId, type Ref } from "react";
import { Badge } from "@/shared/ui/badge";
import { CardPicture } from "@/shared/patterns/display/card/card-picture/card-picture";
import { CardFacts } from "@/shared/patterns/display/card/card-facts/card-facts";
import { CardMore, MoreButton } from "@/shared/patterns/display/card/card-more/card-more";
import { cn } from "@/shared/lib/utils";
import { WikipediaSource } from "@/pokedex";
import { SuggestionDetails } from "./suggestion-details/suggestion-details";
import table from "../discover.de.json";
import { texts } from "@/shared/lib/text-rules/texts";

const t = texts(table);

/**
 * The height the rest of the card needs inside its padding, in rem (see `CardPicture`): the credit, the gaps, the name row of
 * two lines and the row of facts, which takes two rows when both values are unknown. The picture takes what the deck leaves.
 */
const REST = "8rem";

/**
 * The picture with its credit directly under it (US-QS-32, SG-PHOTO-03): the image is a link to its source, not a copy
 * (P-05); without a picture the drawn placeholder of the family stands in (SG-PHOTO-02), never an emoji, and nothing is
 * credited. The credit of the text is in the sheet of "Mehr".
 */
function Picture({ s, fit }: { s: Suggestion; fit: boolean }) {
  const shown = s.imageUrl !== null;
  return (
    <CardPicture
      src={s.imageUrl}
      alt={t("card.imageAlt", { species: s.species })}
      {...(fit ? { reserve: REST } : {})}
      overlay={
        s.exploration ? (
          <Badge className="max-w-full whitespace-normal">{t("card.exploration")}</Badge>
        ) : undefined
      }
      credit={
        shown ? (
          <WikipediaSource
            label={t("card.pictureCredit")}
            sourceUrl={s.sourceUrl}
            shown
            className="-my-3 inline-flex min-h-11 items-center text-muted-foreground"
          />
        ) : undefined
      }
    />
  );
}

/**
 * One suggestion as a two-level card (US-ENT-01, US-QS-32, owner decisions d-066 and d-159): the front shows the picture
 * with its credit, the name, the two facts that decide the swipe (light zone, difficulty) and "Mehr"; the description, the
 * attributes of DM-ENT-01, the sources and the reasons are in the sheet that "Mehr" opens. The gesture and its stamps are the
 * shared `SwipeCard` around it; the buttons stay the way without a gesture (NFR-13). No percentage and no "match"
 * (FR-ENT-06). Its heading id is made per card (`useId`), so the next card can be rendered underneath without a duplicate id
 * on the page. The card never scrolls (US-QS-15): the deck fits one screen, and at large text the deck scrolls as a whole.
 */
export function SuggestionCard(props: {
  suggestion: Suggestion;
  /** The name heading, so the view can move the focus to this card (SC 2.4.3). */
  titleRef?: Ref<HTMLHeadingElement>;
  /**
   * The card takes the free height of its deck (one screen, the default). At large text it takes its own height instead,
   * so the deck scrolls as a whole and the decision buttons follow the card (US-QS-32, SG-TYPE-04).
   */
  fill?: boolean;
  /**
   * The card underneath the front card in the stack (US-ENT-10): hidden from assistive technology and inert. It keeps the room
   * of "Mehr" but opens no sheet and holds no dialog trigger, so nothing on the page is a trigger that cannot take the focus
   * (DS-40, QG-U5).
   */
  preview?: boolean;
}) {
  const s = props.suggestion;
  const titleId = useId();
  const fill = props.fill ?? true;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-md touch-pan-y flex-col gap-2 break-words",
        "rounded-card border border-border bg-card p-3 text-card-foreground",
        // The least height the content needs with the picture at its floor: a frame that is lower scrolls, the card never cuts.
        fill ? "min-h-[15.5rem] flex-1 basis-0 [container-type:size]" : "flex-none",
      )}
    >
      <Picture s={s} fit={fill} />
      {/* "Mehr" stands beside the name and costs no line of its own; at large text it drops below the name. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2
            id={titleId}
            ref={props.titleRef}
            tabIndex={-1}
            className="m-0 scroll-mb-24 text-xl font-semibold"
          >
            {s.species}
          </h2>
          <p className="m-0 text-base">{s.germanName ?? t("card.germanNameUnknown")}</p>
        </div>
        {props.preview ? (
          <MoreButton name={s.species} />
        ) : (
          <CardMore name={s.species}>
            <SuggestionDetails s={s} />
          </CardMore>
        )}
      </div>
      <CardFacts lightZone={s.lightZone} difficulty={s.difficulty} />
    </article>
  );
}

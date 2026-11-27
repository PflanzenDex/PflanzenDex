import { useState, type ReactNode } from "react";
import { ObjectPlaceholder } from "@/shared/lists/object-placeholder/object-placeholder";

/**
 * The picture of a card (US-QS-32, SG-PHOTO-01 to SG-PHOTO-03): a 4:3 box whose room is reserved before the picture comes,
 * the picture covers the box, and a missing or failed picture shows the drawn placeholder of the family in the same box
 * (SG-PHOTO-02, P-10: never an emoji, never an empty box). The box is the full width of the card at every size and text size,
 * never capped by the height of the window (issue 2421, which replaces the cap of PR 2360: a cap made the picture 53 x 40 px,
 * issue 2383). The credit of an outside picture sits directly under the box, in secondary text; a link in it takes its own
 * 44 px target (`inline-flex min-h-11`, SG-TOUCH-01). Generic: it knows no feature's data, so the collector card and the match
 * card can use it too.
 */
export function CardPicture(props: {
  /** The picture's address; `null` when the card has none. */
  src: string | null;
  /** The alternative text of the picture. */
  alt: string;
  /** The credit of the picture (a source line, a link), shown under it when given. */
  credit?: ReactNode;
}) {
  // The address that failed: the placeholder stays until another address comes.
  const [failed, setFailed] = useState<string | null>(null);
  const picture = props.src !== null && props.src !== failed ? props.src : null;
  return (
    <figure data-card-picture="" className="m-0 flex min-w-0 flex-col gap-1">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-tile bg-muted">
        {picture === null ? (
          <ObjectPlaceholder className="absolute top-0 left-0" />
        ) : (
          <img
            src={picture}
            alt={props.alt}
            loading="lazy"
            decoding="async"
            className="absolute top-0 left-0 size-full object-cover"
            onError={() => setFailed(picture)}
          />
        )}
      </div>
      {props.credit !== undefined && (
        <figcaption className="shrink-0 text-sm text-muted-foreground">{props.credit}</figcaption>
      )}
    </figure>
  );
}

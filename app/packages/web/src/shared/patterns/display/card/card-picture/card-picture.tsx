import { cn } from "@/shared/lib/utils";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ObjectPlaceholder } from "@/shared/lists/object-placeholder/object-placeholder";

/**
 * The picture of a card (US-QS-32, SG-PHOTO-01 to SG-PHOTO-03): a 4:3 box whose room is reserved before the picture comes,
 * the picture covers the box, and a missing or failed picture shows the drawn placeholder of the family in the same box
 * (SG-PHOTO-02, P-10: never an emoji, never an empty box). The box is the full width of the card, never capped by a constant
 * of the window height (issue 2421, which replaces the cap of PR 2360: a cap of `100dvh - 600px` made the picture 53 x 40 px,
 * issue 2383). The credit of an outside picture sits directly under the box, in secondary text; a
 * link in it takes its own 44 px target (`inline-flex min-h-11`, SG-TOUCH-01). Generic: it knows no feature's data, so the
 * collector card and the match card can use it too.
 *
 * `reserve` is for a card whose height the deck fixes (a size container: `[container-type:size]`): it names the height the
 * rest of the card needs, in rem so it follows the text size. The box then takes at most the width that leaves that height,
 * 4:3 and centred, so the deck never scrolls (US-QS-15) and the picture is the full width of the card wherever the free height
 * allows it. It never goes below 7.5 rem (120 px at the normal text size, the floor of the one-screen gate). Without a size
 * container `cqh` is the height of the window, and the box stays the full width.
 */
export function CardPicture(props: {
  /** The picture's address; `null` when the card has none. */
  src: string | null;
  /** The alternative text of the picture. */
  alt: string;
  /** The credit of the picture (a source line, a link), shown under it when given. */
  credit?: ReactNode;
  /** A badge on the picture, at its top left corner: it costs the card no line of its own (US-QS-32). */
  overlay?: ReactNode;
  /** The height the rest of the card needs, a CSS length in rem (see above); only for a card in a size container. */
  reserve?: string;
}) {
  // The address that failed: the placeholder stays until another address comes.
  const [failed, setFailed] = useState<string | null>(null);
  const picture = props.src !== null && props.src !== failed ? props.src : null;
  return (
    <figure data-card-picture="" className="m-0 flex min-w-0 flex-col gap-1">
      <div
        className={cn(
          "relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-tile bg-muted",
          props.reserve !== undefined &&
            "mx-auto max-w-[max(7.5rem,calc((100cqh_-_var(--card-rest))*4/3))]",
        )}
        style={
          props.reserve === undefined
            ? undefined
            : ({ "--card-rest": props.reserve } as CSSProperties)
        }
      >
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
        {props.overlay !== undefined && (
          <div className="absolute top-2 left-2 flex max-w-[calc(100%-1rem)]">{props.overlay}</div>
        )}
      </div>
      {props.credit !== undefined && (
        <figcaption className="shrink-0 text-sm text-muted-foreground">{props.credit}</figcaption>
      )}
    </figure>
  );
}

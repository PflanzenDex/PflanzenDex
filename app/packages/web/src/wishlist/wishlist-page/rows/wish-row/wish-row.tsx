import type { Ref } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { useObjectPhoto } from "@/shared/lists/object-row/use-object-photo";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { germanNameOf, SCIENTIFIC } from "@/shared/species-name/species-name";
import { texts } from "@/shared/lib/text-rules/texts";
import { LEVELS, UNKNOWN } from "../../../candidate-card/candidate-card";
import {
  DiscardQuestion,
  DiscardTrigger,
  useDiscardQuestion,
} from "../../../candidate-card/discard/discard";
import { isPlainHttps } from "../../../schemas";
import table from "../../../wishlist.de.json";

const t = texts(table);

/** The layer of one wish is named after the wish: `?sheet=wish-<id>` (US-QS-22). */
export const wishLayerId = (id: string): string => `wish-${id}`;

/**
 * The path of a wish's stored picture, as the card asks it (US-WUN-04): only a stored copy of a plain https address is
 * shown, the same rule as the card (P-05). `undefined` keeps the drawn placeholder.
 */
function storedPicturePath(c: Candidate): string | undefined {
  const image = c.image;
  return image?.stored && isPlainHttps(image.url)
    ? `/wishes/${encodeURIComponent(c.id)}/image`
    : undefined;
}

/** The title: the rank, then the German name upright; without one the scientific name in italics, once (SG-TYPE-08). */
function titleOf(c: Candidate, rank: number) {
  const german = germanNameOf(c.name, c.german);
  return (
    <>
      {`${rank}. `}
      {german ?? <i className={SCIENTIFIC}>{c.name}</i>}
    </>
  );
}

/**
 * The meta line: the zone and the difficulty; with a German name the scientific name leads it, so the name reads in the
 * order it shows (WCAG 2.5.3, US-QS-32).
 */
function metaOf(c: Candidate) {
  const level = c.difficulty ? (LEVELS[c.difficulty] ?? UNKNOWN) : UNKNOWN;
  const zone = `${c.zoneText} · ${t("card.difficulty", { level })}`;
  if (germanNameOf(c.name, c.german) === null) return zone;
  return (
    <>
      <i className={SCIENTIFIC}>{c.name}</i>
      {` · ${zone}`}
    </>
  );
}

/** "Gekauft" (US-WUN-03) and "Verwerfen" (US-WUN-05) beside the row: one small group in the row's action slot. */
function WishActions(props: {
  c: Candidate;
  busy: boolean;
  onBuy: (c: Candidate) => void;
  asking: boolean;
  onAsk: () => void;
  trigger: Ref<HTMLButtonElement>;
}) {
  const { c, busy } = props;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="tinted"
        size="sm"
        disabled={busy}
        aria-label={t("card.buyLabel", { title: c.title })}
        onClick={() => props.onBuy(c)}
      >
        {t("card.buy")}
      </Button>
      {props.asking ? null : (
        <DiscardTrigger c={c} busy={busy} compact onAsk={props.onAsk} triggerRef={props.trigger} />
      )}
    </div>
  );
}

/**
 * A compact wish (US-QS-22, US-QS-32, FX-35 step 5): one object row with its thumbnail (the stored picture, else the drawn
 * placeholder), the rank and the name as its title, the target zone and the difficulty as its meta line. Choosing the row
 * opens the full card in its layer. "Gekauft" and "Verwerfen" stand beside the row; the question of "Verwerfen" opens below
 * the row, where it has the width of the row (US-WUN-05).
 */
export function WishRow(props: {
  c: Candidate;
  rank: number;
  onBuy: (c: Candidate) => void;
  onDiscard: (c: Candidate) => void;
  busy: boolean;
  /** How the stored picture is fetched privately (US-WUN-04, P-05). */
  access: PhotoAccess;
}) {
  const { c, rank, access } = props;
  const { openLayer, open } = useLayer(wishLayerId(c.id));
  const [ref, src] = useObjectPhoto(access, storedPicturePath(c));
  const discard = useDiscardQuestion();
  return (
    <div data-priority={c.priority.kind} className="min-w-0">
      {/* The actions wrap below the name at 200 % text (the object row rule, issue 2322): the row never needs a sideways scroll. */}
      <ObjectRow
        rootRef={ref}
        src={src}
        title={titleOf(c, rank)}
        meta={metaOf(c)}
        haspopup="dialog"
        expanded={open}
        onClick={(event) => openLayer(event.currentTarget)}
        action={
          <WishActions
            c={c}
            busy={props.busy}
            onBuy={props.onBuy}
            asking={discard.asking}
            onAsk={discard.ask}
            trigger={discard.triggerRef}
          />
        }
      />
      {discard.asking ? (
        <div className="px-3 pb-3">
          <DiscardQuestion
            c={c}
            busy={props.busy}
            onDiscard={props.onDiscard}
            onCancel={discard.cancel}
          />
        </div>
      ) : null}
    </div>
  );
}

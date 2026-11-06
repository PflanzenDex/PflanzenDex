import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { cn } from "@/shared/lib/utils";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { isPlainHttps } from "../schemas";
import { Discard } from "./discard/discard";
import { LazyFriendsSwitch } from "./lazy-friends-switch/lazy-friends-switch";
import { Picture, StoredPicture } from "./picture/picture";
import table from "../wishlist.de.json";

const t = texts(table);

export const LEVELS: Record<number, string> = {
  1: t("card.level.1"),
  2: t("card.level.2"),
  3: t("card.level.3"),
};
export const UNKNOWN = t("card.unknown");

/** The thinnest zone is marked in words and by a border, not by colour alone; unknown or outside zones get a dashed border. */
const PRIORITY_BORDER: Record<string, string> = {
  thinnest: "border-2 border-primary",
  zone_unknown: "border-dashed",
  zone_outside: "border-dashed",
};

/** Title, place in the list, zone with stock, difficulty, reasoning and why it stands here (US-WUN-01). */
function CandidateText(props: { c: Candidate; rank: number; className?: string }) {
  const { c, rank, className } = props;
  return (
    <div className={cn("grid min-w-0 content-start gap-1", className)}>
      <h2 className="text-lg font-semibold">{c.title}</h2>
      <p className="w-fit rounded-full bg-muted px-3 py-0.5 text-sm font-semibold text-muted-foreground">
        {t("card.rank", { rank })}
      </p>
      <p className="font-bold">{c.zoneText}</p>
      <p>
        {t("card.difficulty", {
          level: c.difficulty ? (LEVELS[c.difficulty] ?? UNKNOWN) : UNKNOWN,
        })}
      </p>
      {c.reasoning && <p>{c.reasoning}</p>}
      <p className="text-sm text-muted-foreground">{c.priority.text}</p>
    </div>
  );
}

/**
 * One open candidate (US-WUN-01): picture with its source, title, target zone with stock, difficulty, reasoning and why it
 * stands here; "Gekauft" records the purchase (US-WUN-03), "Verwerfen" discards the wish (US-WUN-05). A stored picture
 * sits next to the title and opens large (US-WUN-06); every other card keeps the picture full width above the text.
 */
export function CandidateCard(props: {
  c: Candidate;
  rank: number;
  /** Records the purchase; without it the card has no action. */
  onBuy?: (c: Candidate) => void;
  /** Sets the wish to discarded (US-WUN-05); asks first. Without it the card has no such action. */
  onDiscard?: (c: Candidate) => void;
  /** A write is running: the action waits, so a double tap writes once. */
  busy?: boolean;
  /** How the stored image is fetched privately (US-WUN-04, P-05); the same access serves the switch "Für Freunde als gesucht zeigen" (DM-TAU-02). */
  photoAccess?: PhotoAccess;
  /** Stores a local copy of the image from Wikimedia Commons (US-WUN-04); without it the card has no such action. */
  onStoreImage?: (c: Candidate) => void;
}) {
  const { c, rank, onBuy, onDiscard } = props;
  const image = c.image;
  const stored =
    image && props.photoAccess && image.stored && isPlainHttps(image.url)
      ? props.photoAccess
      : null;
  const sourceLine = image
    ? t("picture.sourceLicense", { source: image.source, license: image.license ?? UNKNOWN })
    : "";
  return (
    <li
      data-priority={c.priority.kind}
      className={cn(
        "animate-list-in grid min-w-0 content-start gap-1 break-words rounded-card border border-border bg-card p-3 text-card-foreground shadow-elevation-1",
        PRIORITY_BORDER[c.priority.kind],
      )}
    >
      {stored ? (
        <>
          <div className="flex min-w-0 items-start gap-3">
            <StoredPicture c={c} access={stored} sourceLine={sourceLine} />
            <CandidateText c={c} rank={rank} className="flex-1" />
          </div>
          <p className="text-sm text-muted-foreground">{sourceLine}</p>
        </>
      ) : (
        <>
          <Picture c={c} onStoreImage={props.onStoreImage} busy={props.busy === true} />
          <CandidateText c={c} rank={rank} className="mt-2" />
        </>
      )}
      {onBuy && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="mt-2 rounded-full"
          disabled={props.busy === true}
          aria-label={t("card.buyLabel", { title: c.title })}
          onClick={() => onBuy(c)}
        >
          {t("card.buy")}
        </Button>
      )}
      {onDiscard && <Discard c={c} onDiscard={onDiscard} busy={props.busy === true} />}
      {props.photoAccess && (
        <LazyFriendsSwitch {...props.photoAccess} wishId={c.id} title={c.title} />
      )}
    </li>
  );
}

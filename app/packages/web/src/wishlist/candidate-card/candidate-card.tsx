import { useState } from "react";
import type { Candidate } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isPlainHttps } from "../schemas";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";

/** The thinnest zone is marked in words and by a border, not by colour alone; unknown or outside zones get a dashed border. */
const PRIORITY_BORDER: Record<string, string> = {
  thinnest: "border-2 border-primary",
  zone_unknown: "border-dashed",
  zone_outside: "border-dashed",
};

const placeholder =
  "grid min-h-18 place-items-center rounded-lg border border-dashed border-border text-muted-foreground";

/**
 * The picture of a candidate. The address was typed by a keeper; loading it would make every viewer's browser contact
 * a third-party host (IP address, browser, referrer) and breaks P-05. Until pictures are saved locally (US-WUN-04) it
 * is only a link the viewer follows on purpose, with the source next to it.
 */
function Picture({ image }: { image: Candidate["image"] }) {
  if (!image || !isPlainHttps(image.url)) return <span className={placeholder}>Kein Bild</span>;
  return (
    <figure className="m-0 grid gap-1">
      <span className={placeholder}>
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="inline-flex min-h-[44px] items-center p-3 text-center text-primary underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Bild ansehen (öffnet extern)
        </a>
      </span>
      <figcaption className="text-sm text-muted-foreground">Quelle: {image.source}</figcaption>
    </figure>
  );
}

/** "Verwerfen" asks before it writes: the wish stays stored under "Verworfen", but there is no way back yet (P-10). */
function Discard(props: { c: Candidate; onDiscard: (c: Candidate) => void; busy: boolean }) {
  const { c } = props;
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button
        type="button"
        variant="ghost"
        size="touch"
        disabled={props.busy}
        aria-label={`Verwerfen: ${c.title}`}
        onClick={() => setAsking(true)}
      >
        Verwerfen
      </Button>
    );
  return (
    <div className="grid gap-2">
      <p>Wirklich verwerfen? Der Wunsch bleibt unter „Verworfen“ gespeichert.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="touch"
          disabled={props.busy}
          aria-label={`Ja, verwerfen: ${c.title}`}
          onClick={() => props.onDiscard(c)}
        >
          Ja, verwerfen
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={() => setAsking(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/**
 * One open candidate (US-WUN-01): picture link with its source, title, target zone with stock, difficulty, reasoning
 * and why it stands here; "Gekauft" records the purchase (US-WUN-03), "Verwerfen" discards the wish (US-WUN-05).
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
}) {
  const { c, rank, onBuy, onDiscard } = props;
  return (
    <li
      data-priority={c.priority.kind}
      className={cn(
        "grid min-w-0 content-start gap-1 break-words rounded-xl border border-border bg-card p-3 text-card-foreground",
        PRIORITY_BORDER[c.priority.kind],
      )}
    >
      <Picture image={c.image} />
      <h2 className="mt-2 text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-muted-foreground">Platz {rank} der Liste</p>
      <p className="font-bold">{c.zoneText}</p>
      <p>Schwierigkeit: {c.difficulty ? (LEVELS[c.difficulty] ?? UNKNOWN) : UNKNOWN}</p>
      {c.reasoning && <p>{c.reasoning}</p>}
      <p className="text-sm text-muted-foreground">{c.priority.text}</p>
      {onBuy && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="mt-2"
          disabled={props.busy === true}
          aria-label={`Gekauft: ${c.title}`}
          onClick={() => onBuy(c)}
        >
          Gekauft
        </Button>
      )}
      {onDiscard && <Discard c={c} onDiscard={onDiscard} busy={props.busy === true} />}
    </li>
  );
}

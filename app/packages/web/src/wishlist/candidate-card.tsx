import type { Candidate } from "@pflanzendex/core";
import { cn } from "@/lib/utils";
import { isPlainHttps } from "./schemas";

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

/** One open candidate (US-WUN-01): picture link with its source, title, target zone with stock, difficulty, reasoning and why it stands here. */
export function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
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
    </li>
  );
}

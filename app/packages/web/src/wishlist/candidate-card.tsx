import type { Candidate } from "@pflanzendex/core";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";

/** Only an https address becomes a link; anything else is treated as no picture at all. */
function isHttpsAddress(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The picture of a candidate. The address was typed by a keeper; loading it would make every viewer's browser contact
 * a third-party host (IP address, browser, referrer) and breaks P-05. Until pictures are saved locally (US-WUN-04) it
 * is only a link the viewer follows on purpose, with the source next to it.
 */
function Picture({ image }: { image: Candidate["image"] }) {
  if (!image || !isHttpsAddress(image.url))
    return <span className="wish-photo wish-placeholder">Kein Bild</span>;
  return (
    <figure className="candidate-figure">
      <span className="wish-photo wish-placeholder">
        <a href={image.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          Bild ansehen (öffnet extern)
        </a>
      </span>
      <figcaption className="quiet">Quelle: {image.source}</figcaption>
    </figure>
  );
}

/** One open candidate (US-WUN-01): picture link with its source, title, target zone with stock, difficulty, reasoning and why it stands here. */
export function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  return (
    <li className="wish-card candidate" data-priority={c.priority.kind}>
      <Picture image={c.image} />
      <h2>{c.title}</h2>
      <p className="candidate-rank">Platz {rank} der Liste</p>
      <p>
        <strong>{c.zoneText}</strong>
      </p>
      <p>Schwierigkeit: {c.difficulty ? (LEVELS[c.difficulty] ?? UNKNOWN) : UNKNOWN}</p>
      {c.reasoning && <p>{c.reasoning}</p>}
      <p className={`quiet priority-${c.priority.kind}`}>{c.priority.text}</p>
    </li>
  );
}

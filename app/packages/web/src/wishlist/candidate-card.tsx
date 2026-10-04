import type { Candidate } from "@pflanzendex/core";

const LEVELS: Record<number, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer" };
const UNKNOWN = "unbekannt";

/** One open candidate (US-WUN-01): picture with its source, title, target zone with stock, difficulty, reasoning and why it stands here. */
export function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  return (
    <li className="specimen-card candidate" data-priority={c.priority.kind}>
      {c.image ? (
        <figure className="candidate-figure">
          <span className="card-photo">
            <img src={c.image.url} alt={`Foto: ${c.title}`} loading="lazy" />
          </span>
          <figcaption className="quiet">Quelle: {c.image.source}</figcaption>
        </figure>
      ) : (
        <span className="card-photo platzhalter">Kein Bild</span>
      )}
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

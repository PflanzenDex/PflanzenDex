import type { CSSProperties } from "react";
import {
  milestoneOverview,
  milestones,
  type CaughtSpecies,
  type Milestone,
  type MilestoneLevel,
  type MilestoneTree,
} from "@pflanzendex/core";

const LEVEL: Record<MilestoneLevel, string> = {
  discovered: "Entdeckt",
  connoisseur: "Kenner",
  complete: "Vollständig",
  explorer: "Entdecker der Ordnungen",
};

const label = (m: Milestone) => (m.title === "" ? LEVEL[m.level] : `${m.title}: ${LEVEL[m.level]}`);
const named = (s: { latin: string; german: string | null }) =>
  s.german === null ? s.latin : `${s.german} (${s.latin})`;

function Open(props: { milestone: Milestone }) {
  const m = props.milestone;
  return (
    <li className="grid gap-1 rounded-lg border p-3">
      <span className="font-semibold">{label(m)}</span>
      <div
        role="progressbar"
        aria-label={`Fortschritt ${label(m)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((m.current / m.target) * 100)}
        className="h-2 overflow-hidden rounded bg-muted"
      >
        <span
          className="block h-full w-[calc(var(--value)*1%)] bg-primary"
          style={{ "--value": (m.current / m.target) * 100 } as CSSProperties}
        />
      </div>
      <span>{`Noch ${m.remaining}: ${m.missing.map(named).join(", ")}`}</span>
    </li>
  );
}

/**
 * Milestones with an instruction for action (US-POK-11), derived from the caught species and the taxonomy tree
 * (US-POK-03). Without the tree there are no targets, so the section says so (P-08, P-10).
 */
export function Milestones(props: {
  caught: readonly CaughtSpecies[];
  tree?: MilestoneTree | null;
}) {
  if (!props.tree) {
    return (
      <p className="mb-3 text-sm">
        Meilensteine brauchen den Baum der Arten, der noch nicht aufgebaut ist.
      </p>
    );
  }
  const dates = new Map(props.caught.map((c) => [c.species, c.caughtDate.date]));
  const { open, reached } = milestoneOverview(milestones(props.tree, dates));
  return (
    <section aria-label="Meilensteine" className="mb-3 grid gap-2">
      <ul className="grid gap-2">
        {open.map((m) => (
          <Open key={m.id} milestone={m} />
        ))}
      </ul>
      {reached.length > 0 && (
        <details>
          <summary>{`${reached.length} Meilensteine erreicht`}</summary>
          <ul>
            {reached.map((m) => (
              <li key={m.id}>{m.reachedOn ? `${label(m)} (${m.reachedOn})` : label(m)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

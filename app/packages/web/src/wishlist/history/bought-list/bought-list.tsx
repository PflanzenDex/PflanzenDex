import type { BoughtList as Bought } from "@pflanzendex/core";
import { CreateSpecimenButton, type WishToPlant } from "../../actions/actions";

/**
 * The bought wishes (US-WUN-03): they left the candidate list but are kept, so a purchase never disappears silently
 * (P-10). Says what to do next (P-09). A wish without a specimen offers the way to the plant (US-WUN-05); a linked one
 * says "Gekauft → Exemplar angelegt". Without bought wishes the section does not exist.
 */
export function BoughtList(props: {
  bought: Bought;
  /** Starts the way to the plant for a bought wish; without it there is no such action. */
  onCreateSpecimen?: (w: WishToPlant) => void;
}) {
  const { bought, onCreateSpecimen } = props;
  if (bought.bought.length === 0) return null;
  return (
    <section aria-labelledby="bought-title" className="mt-7 flex min-w-0 flex-col gap-2">
      <h2 id="bought-title" className="text-xl font-semibold">
        Gekauft
      </h2>
      <p className="text-muted-foreground">
        {bought.hint.text} Sie stehen nicht mehr in der Wunschliste, bleiben aber hier erhalten.
      </p>
      <p className="font-semibold">{bought.hint.nextAction}</p>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Gekaufte Wünsche">
        {bought.bought.map((w) => (
          <li key={w.id} className="grid break-words rounded-lg border border-border p-3">
            <span>{w.title}</span>
            {w.specimenId !== null ? (
              <span className="text-sm text-muted-foreground">Gekauft → Exemplar angelegt</span>
            ) : (
              onCreateSpecimen && (
                <CreateSpecimenButton
                  named
                  wish={{ id: w.id, name: w.name, title: w.title }}
                  onCreate={onCreateSpecimen}
                />
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

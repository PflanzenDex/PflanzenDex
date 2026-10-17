import type { UnfitWish } from "@pflanzendex/core";

/**
 * Open wishes that do not count in the space question (FR-WUN-03): no target zone, or the cutting light. Each line
 * names the wish, its zone ("unbekannt" if there is none, P-08), why it does not count and what to do next (P-09).
 * Nothing is removed or changed here (P-10): the wish stays among the candidates, where it can be discarded.
 */
export function UnfitWishes({ wishes }: { wishes: readonly UnfitWish[] }) {
  if (wishes.length === 0) return null;
  return (
    <section
      aria-labelledby="unfit-wishes-title"
      className="grid gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <h2 id="unfit-wishes-title" className="text-lg font-semibold">
        Wünsche ohne passende Zone
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0">
        {wishes.map((w) => (
          <li key={w.id} className="grid gap-1">
            <p className="font-semibold">{w.title}</p>
            <p className="text-sm text-muted-foreground">Zone: {w.zone ?? "unbekannt"}</p>
            <p>{w.reason}</p>
            <p className="font-semibold">{w.nextAction}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

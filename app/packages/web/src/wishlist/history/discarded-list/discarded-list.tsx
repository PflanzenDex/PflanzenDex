import type { DiscardedList as Discarded } from "@pflanzendex/core";

/**
 * The discarded wishes (US-WUN-05): they left the candidate list but are kept, so a discarded wish never disappears
 * silently (P-10). Says what to do next (P-09). Without discarded wishes the section does not exist.
 */
export function DiscardedList({ discarded }: { discarded: Discarded }) {
  if (discarded.discarded.length === 0) return null;
  return (
    <section aria-labelledby="discarded-title" className="mt-7 flex min-w-0 flex-col gap-2">
      <h2 id="discarded-title" className="text-xl font-semibold">
        Verworfen
      </h2>
      <p className="text-muted-foreground">{discarded.hint.text}</p>
      <p className="font-semibold">{discarded.hint.nextAction}</p>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Verworfene Wünsche">
        {discarded.discarded.map((w) => (
          <li key={w.id} className="break-words rounded-lg border border-border p-3">
            {w.title}
          </li>
        ))}
      </ul>
    </section>
  );
}

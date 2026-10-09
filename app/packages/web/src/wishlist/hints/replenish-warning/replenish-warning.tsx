import type { Replenishment } from "@pflanzendex/core";

/**
 * The warning before the candidate list runs empty (US-WUN-02): one line per zone 2 to 4 below the buffer and what to
 * do next (P-09). Without a shortage it does not exist. The actions "Discover for <zone>" and "Fetch suggestions"
 * appear with their stories (US-ENT-07, US-WUN-04), not before.
 */
export function ReplenishWarning({ replenishment }: { replenishment: Replenishment }) {
  if (replenishment.zones.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-destructive p-3">
      <ul className="m-0 list-none p-0">
        {replenishment.zones.map((z) => (
          <li key={z.zoneId} className="font-semibold">
            {z.text}
          </li>
        ))}
      </ul>
      {replenishment.nextAction ? <p className="mt-1">{replenishment.nextAction}</p> : null}
    </div>
  );
}

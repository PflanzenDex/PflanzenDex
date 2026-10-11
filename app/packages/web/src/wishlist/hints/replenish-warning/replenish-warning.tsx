import type { Replenishment } from "@pflanzendex/core";
import { Link } from "react-router";
import { Button } from "@/components/ui/button/button";

/**
 * The warning before the candidate list runs empty (US-WUN-02): one line per zone 2 to 4 below the buffer and what to
 * do next (P-09). Without a shortage it does not exist. "Discover for <zone>" opens the suggestions filtered to the
 * zone (US-ENT-07); "Fetch suggestions" appears with its story (US-WUN-04), not before.
 */
export function ReplenishWarning({ replenishment }: { replenishment: Replenishment }) {
  if (replenishment.zones.length === 0) return null;
  return (
    <div role="status" className="rounded-lg border border-destructive p-3">
      <ul className="m-0 list-none p-0">
        {replenishment.zones.map((z) => (
          <li key={z.zoneId} className="flex flex-wrap items-center gap-2 font-semibold">
            {z.text}
            {replenishment.actions.discover ? (
              <Button asChild variant="outline" size="touch">
                <Link
                  to={`/discover?view=suggestions&zone=${z.zoneNumber}`}
                >{`Entdecken für ${z.name}`}</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {replenishment.nextAction ? <p className="mt-1">{replenishment.nextAction}</p> : null}
    </div>
  );
}

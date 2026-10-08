import type { CSSProperties } from "react";
import type { NotCounted, Distribution } from "@pflanzendex/core";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { NextAction, Quiet, SUBTITLE } from "./parts";

/** The bar of the thinnest zone takes the warning token; the words "dünnste Zone" carry the meaning too (DS-38). */
const barTone = cva("block h-full w-[calc(var(--value)*1%)] rounded-full", {
  variants: { thinnest: { true: "bg-warning-border", false: "bg-primary" } },
  defaultVariants: { thinnest: false },
});

const specimens = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** What was not counted and why; nothing disappears silently (P-10). Empty if everything is counted. */
function notCounted(n: NotCounted): string | null {
  const share = [
    n.cuttingLight > 0 && `${n.cuttingLight} unter Stecklingslicht`,
    n.archived > 0 && `${n.archived} archiviert`,
    n.zoneUnknown > 0 && `${n.zoneUnknown} mit unbekannter Zone (siehe Hinweise)`,
  ].filter(Boolean);
  return share.length === 0 ? null : `Nicht mitgezählt: ${share.join(", ")}.`;
}

/**
 * Where there is still room (US-LIC-02): specimens per light zone 2 to 4, the thinnest zone (all with a tie) and what
 * to do next (P-09). Cutting light does not count; the numbers come from the API, nothing is calculated here.
 */
export function DistributionView({ distribution }: { distribution: Distribution }) {
  const thin = new Set(distribution.thinnest.map((z) => z.id));
  const highest = Math.max(1, ...distribution.zones.map((z) => z.count));
  const rest = notCounted(distribution.notCounted);
  return (
    <section
      aria-labelledby="distribution-title"
      className="mb-5 grid gap-1 rounded-card bg-secondary px-4 pb-3 pt-1 text-secondary-foreground"
    >
      <h2 id="distribution-title" className={cn(SUBTITLE, "mt-3")}>
        Verteilung auf die Lichtzonen
      </h2>
      <p>{distribution.hint.text}</p>
      <NextAction>{distribution.hint.nextAction}</NextAction>
      {distribution.zones.length > 0 && (
        <ul aria-label="Exemplare je Lichtzone" className="m-0 my-3 grid list-none gap-2.5 p-0">
          {distribution.zones.map(({ zone, count }) => (
            <li key={zone.id} className="grid gap-1 break-words">
              <span>
                {zone.name}: {specimens(count)}
                {thin.has(zone.id) && <strong> · dünnste Zone</strong>}
              </span>
              <span
                aria-hidden="true"
                className="block h-2 w-full overflow-hidden rounded-full bg-background"
              >
                <span
                  data-bar=""
                  className={barTone({ thinnest: thin.has(zone.id) })}
                  style={{ "--value": (count / highest) * 100 } as CSSProperties}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Quiet>
        Stecklingslicht zählt nicht; es zählt die Zone des Standorts, sonst die der Art.
      </Quiet>
      {rest && <Quiet>{rest}</Quiet>}
    </section>
  );
}

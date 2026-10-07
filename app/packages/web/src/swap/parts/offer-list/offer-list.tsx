import type { OfferView } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { healthText, MODE_TEXT, TYPE_TEXT } from "../offer-form/health-text";

const STATUS_TEXT = {
  open: "Offen",
  reserved: "Reserviert",
  handed_over: "Übergeben",
  withdrawn: "Zurückgezogen",
} as const;

/**
 * My offers (US-SOZ-08): type, mode, wish, note, health details (open treatment or the last one, never agent or notes)
 * and the dormancy phase; withdrawing is possible while an offer is open or reserved. Withdrawn and handed-over offers
 * stay in the list (P-10). Without offers the section says what to do next (P-09).
 */
export function OfferList(props: {
  offers: readonly OfferView[];
  busy: boolean;
  onWithdraw: (o: OfferView) => void;
}) {
  return (
    <section aria-labelledby="offer-list-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="offer-list-title" className="text-xl font-semibold">
        Meine Angebote
      </h2>
      {props.offers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Du hast noch nichts angeboten. Gib ein Exemplar für Freunde frei und biete es unten zum
          Tausch an.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Meine Angebote">
          {props.offers.map((o) => {
            const active = o.status === "open" || o.status === "reserved";
            return (
              <li key={o.id} className="grid break-words rounded-lg border border-border p-3">
                <span className="font-semibold">{o.specimenName ?? "Exemplar unbekannt"}</span>
                <span className="text-sm">
                  {TYPE_TEXT[o.type]} · {MODE_TEXT[o.mode]}
                </span>
                {o.wish && <span className="text-sm">Wunsch: {o.wish}</span>}
                {o.note && <span className="text-sm">Hinweis: {o.note}</span>}
                <span className="text-sm text-muted-foreground">{healthText(o.health)}</span>
                {o.phase === "dormancy" && (
                  <span className="text-sm text-muted-foreground">Zurzeit in der Ruhephase.</span>
                )}
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={active ? "default" : "outline"}>{STATUS_TEXT[o.status]}</Badge>
                  {active && (
                    <Button
                      type="button"
                      size="touch"
                      variant="outline"
                      disabled={props.busy}
                      aria-label={`Angebot für ${o.specimenName ?? "Exemplar"} zurückziehen`}
                      onClick={() => props.onWithdraw(o)}
                    >
                      Zurückziehen
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

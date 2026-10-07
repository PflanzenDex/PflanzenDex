import { useState } from "react";
import type { Friend } from "@pflanzendex/core";
import { Button } from "@/components/ui/button";
import { dateText } from "../invite-card/invite-card";
import { nameOf } from "../request-list/request-list";

function EndConfirm(props: { name: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div
      role="group"
      aria-label={`Freundschaft mit ${props.name} beenden`}
      className="mt-2 flex flex-col gap-2"
    >
      <p>
        Wenn ihr die Freundschaft beendet, sieht {props.name} sofort nichts mehr von dir und du
        nichts mehr von ihr oder ihm; alle Freigaben gelten dann nicht mehr. Deine eigenen Daten
        bleiben erhalten. Was schon übertragen wurde, lässt sich nicht zurückholen. Die Person wird
        nicht benachrichtigt.
      </p>
      <span className="flex gap-2">
        <Button
          type="button"
          size="touch"
          variant="destructive"
          disabled={props.busy}
          onClick={props.onYes}
        >
          Ja, beenden
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={props.onNo}>
          Abbrechen
        </Button>
      </span>
    </div>
  );
}

/**
 * The confirmed friends (US-SOZ-02, US-SOZ-03): display name and since when, nothing from their collections: what a
 * friend sees is decided per specimen, private by default (US-SOZ-04, P-05). No rankings, no counts against each other.
 * The number of shared caught species counts only what the friend shares: "unbekannt" when nothing is shared, never 0
 * by guess (P-08). Ending a friendship asks first and says what it does (P-10).
 */
export function FriendList(props: {
  friends: readonly Friend[];
  busy: boolean;
  onEnd: (friend: Friend) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <section aria-labelledby="friend-list-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-list-title" className="text-xl font-semibold">
        Meine Freunde
      </h2>
      {props.friends.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Noch keine Freunde. Nimm eine Anfrage an oder lade jemanden mit einem Code ein.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label="Freunde">
          {props.friends.map((f) => (
            <li key={f.id} className="grid break-words rounded-lg border border-border p-3">
              <span>{nameOf(f.name)}</span>
              <span className="text-sm text-muted-foreground">
                befreundet seit {dateText(f.since)}
              </span>
              <span className="text-sm text-muted-foreground">
                {f.sharedSpecies === null
                  ? "Gemeinsame Arten: unbekannt (noch nichts freigegeben)"
                  : `Gemeinsame Arten: ${f.sharedSpecies}`}
              </span>
              {asking === f.id ? (
                <EndConfirm
                  name={nameOf(f.name)}
                  busy={props.busy}
                  onYes={() => {
                    setAsking(null);
                    props.onEnd(f);
                  }}
                  onNo={() => setAsking(null)}
                />
              ) : (
                <span className="mt-2">
                  <Button
                    type="button"
                    size="touch"
                    variant="outline"
                    aria-label={`Freundschaft mit ${nameOf(f.name)} beenden`}
                    onClick={() => setAsking(f.id)}
                  >
                    Freundschaft beenden
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

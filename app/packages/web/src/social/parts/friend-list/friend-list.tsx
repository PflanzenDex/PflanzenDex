import { useIsShort } from "@/components/shared/responsive/pager/card-page-size";
import { useState } from "react";
import { Link } from "react-router";
import type { Friend } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Avatar } from "@/components/data-display/avatar/avatar";
import { Card } from "@/components/data-display/card/card";
import { Button } from "@/components/ui/button/button";
import { dateText } from "../invite-card/invite-card";
import { nameOf } from "../request-list/request-list";

/** Friends per page in the layer (starting value, assumption; US-QS-20). */
const PAGE_SIZE = 3;
/** On a short phone (at most 700 px high) a page holds fewer friends (#1029 replaces this). */
const SHORT_PAGE_SIZE = 2;

function EndConfirm(props: { name: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div
      role="group"
      aria-label={`Freundschaft beenden: ${props.name}`}
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

function FriendRow(props: { friend: Friend; busy: boolean; onEnd: (friend: Friend) => void }) {
  const { friend: f } = props;
  const [asking, setAsking] = useState(false);
  return (
    <div>
      <Card className="grid gap-1 break-words">
        <span className="flex items-center gap-3">
          <Avatar name={f.name ?? ""} decorative />
          <span className="text-base">{nameOf(f.name)}</span>
        </span>
        <span className="text-sm text-muted-foreground">befreundet seit {dateText(f.since)}</span>
        <span className="text-sm text-muted-foreground">
          {f.sharedSpecies === null
            ? "Gemeinsame Arten: unbekannt (noch nichts freigegeben)"
            : `Gemeinsame Arten: ${f.sharedSpecies}`}
        </span>
        <span className="mt-1 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="touch">
            <Link to={`/friends/${f.id}`} aria-label={`Sammlung ansehen: ${nameOf(f.name)}`}>
              Sammlung ansehen
            </Link>
          </Button>
          {!asking && (
            <Button
              type="button"
              size="touch"
              variant="outline"
              aria-label={`Freundschaft beenden: ${nameOf(f.name)}`}
              onClick={() => setAsking(true)}
            >
              Freundschaft beenden
            </Button>
          )}
        </span>
        {asking && (
          <EndConfirm
            name={nameOf(f.name)}
            busy={props.busy}
            onYes={() => {
              setAsking(false);
              props.onEnd(f);
            }}
            onNo={() => setAsking(false)}
          />
        )}
      </Card>
    </div>
  );
}

/**
 * The confirmed friends (US-SOZ-02, US-SOZ-03): display name, start, the number of shared caught species and the way to
 * the friend's shared collection (US-SOZ-07). Nothing from their collections here: what a friend sees is decided per
 * specimen, private by default (US-SOZ-04, P-05). No rankings. The number counts only what the friend shares: "unbekannt"
 * when nothing is shared, never 0 by guess (P-08). Ending a friendship asks first and says what it does (P-10).
 */
export function FriendList(props: {
  friends: readonly Friend[];
  busy: boolean;
  onEnd: (friend: Friend) => void;
}) {
  const short = useIsShort();
  return (
    <section aria-label="Meine Freunde" className="flex min-w-0 flex-col gap-3">
      {props.friends.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Noch keine Freunde. Mit „Freund hinzufügen“ lädst du jemanden ein.
        </p>
      ) : (
        <Pager
          items={props.friends}
          pageSize={short ? SHORT_PAGE_SIZE : PAGE_SIZE}
          label="Freunde"
          getKey={(f) => f.id}
          renderItem={(f) => <FriendRow friend={f} busy={props.busy} onEnd={props.onEnd} />}
        />
      )}
    </section>
  );
}

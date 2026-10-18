import type { MatchEntry } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";

const germanDate = (d: string) => d.split("-").reverse().join(".");
const entryName = (e: MatchEntry) =>
  `${e.speciesGerman ?? e.speciesLatin ?? "Art unbekannt"} von ${e.giverName ?? "einem Freund"}`;

/** What became of the offer, in words (US-TAU-06): nothing is conveyed by color alone (NFR-13). */
const STATE_TEXT: Record<Exclude<MatchEntry["state"], "open">, string> = {
  requested: "Schon angefragt, du findest sie unter Anfragen.",
  wish_done: "Wunsch erledigt: Das Angebot kommt nicht mehr in den Stapel.",
  unavailable:
    "Nicht mehr verfügbar: Das Angebot wurde zurückgezogen oder vergeben, oder die Freundschaft endete.",
};

function EntryRow(props: {
  e: MatchEntry;
  busy: boolean;
  label: string;
  onAct: (e: MatchEntry) => void;
}) {
  const { e, busy } = props;
  const closed = e.state !== "open";
  return (
    <li className="grid gap-1 border-b border-border py-2 last:border-b-0">
      <span>{`${entryName(e)} · ${germanDate(e.answeredOn)}`}</span>
      {closed && <span className="text-muted-foreground">{STATE_TEXT[e.state]}</span>}
      {(closed || props.label) && (
        <Button
          variant="outline"
          size="touch"
          disabled={busy}
          aria-label={`${closed ? "Aus der Liste entfernen" : props.label}: ${entryName(e)}`}
          onClick={() => props.onAct(e)}
        >
          {closed ? "Aus der Liste entfernen" : props.label}
        </Button>
      )}
    </li>
  );
}

const BOX = "grid gap-2 rounded-lg border border-border p-3";
const HINT = "m-0 text-sm text-muted-foreground";

interface Handlers {
  readonly busy: boolean;
  readonly onShowLater: () => void;
  readonly onReconsider: (offerId: string) => void;
  readonly onRemove: (offerId: string) => void;
}

function LaterList(props: Handlers & { rows: readonly MatchEntry[] }) {
  const { rows } = props;
  const act = (e: MatchEntry) => props.onRemove(e.offerId);
  return (
    <section aria-labelledby="later-title" className={BOX}>
      <h2 id="later-title" className="m-0 text-base font-semibold">
        {`Später ansehen (${rows.length})`}
      </h2>
      {rows.length === 0 ? (
        <p className={HINT}>
          Noch nichts auf später gesetzt. Mit „Später“ legst du eine Karte hierher; sie kommt am
          nächsten Tag wieder in den Stapel.
        </p>
      ) : (
        <>
          <ul className="m-0 list-none p-0 text-sm">
            {rows.map((e) => (
              <EntryRow key={e.offerId} e={e} busy={props.busy} label="" onAct={act} />
            ))}
          </ul>
          {rows.some((e) => e.card) && (
            <Button variant="outline" size="touch" onClick={props.onShowLater}>
              Diese Karten jetzt ansehen
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function DeclinedList(props: Handlers & { rows: readonly MatchEntry[] }) {
  const { rows } = props;
  const act = (e: MatchEntry) =>
    e.state === "open" ? props.onReconsider(e.offerId) : props.onRemove(e.offerId);
  return (
    <section aria-labelledby="declined-title" className={BOX}>
      <h2 id="declined-title" className="m-0 text-base font-semibold">
        {`Abgelehnt (${rows.length})`}
      </h2>
      {rows.length === 0 ? (
        <p className={HINT}>
          Noch nichts abgelehnt. Mit „Nein“ sortierst du eine Karte aus; hier findest du sie wieder
          und kannst sie dir noch einmal überlegen.
        </p>
      ) : (
        <ul className="m-0 list-none p-0 text-sm">
          {rows.map((e) => (
            <EntryRow key={e.offerId} e={e} busy={props.busy} label="Wieder ansehen" onAct={act} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The private lists "Später ansehen" and "Abgelehnt" (US-TAU-06, P-10): every answer stays findable with its date, an
 * offer that ended is marked and removed only by the keeper, and each empty list says what to do next (P-09). The giver
 * sees none of it (FR-TAU-02).
 */
export function AnswerLists(props: Handlers & { entries: readonly MatchEntry[] }) {
  return (
    <div className="grid gap-3">
      <LaterList {...props} rows={props.entries.filter((e) => e.answer === "later")} />
      <DeclinedList {...props} rows={props.entries.filter((e) => e.answer === "no")} />
    </div>
  );
}

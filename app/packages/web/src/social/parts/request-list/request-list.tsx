import type { FriendRequest, OpenRequests } from "@pflanzendex/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** A person without a stored display name stays unknown instead of being named by guess (P-08). */
export const nameOf = (name: string | null) => name ?? "Name unbekannt";

function Incoming(props: {
  request: FriendRequest;
  busy: boolean;
  onAnswer: (id: string, decision: "accept" | "decline") => void;
}) {
  const { request: r } = props;
  const who = nameOf(r.otherName);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="min-w-0 break-words">{who} möchte mit dir befreundet sein.</span>
      <span className="flex gap-2">
        <Button
          type="button"
          size="touch"
          disabled={props.busy}
          aria-label={`Anfrage von ${who} annehmen`}
          onClick={() => props.onAnswer(r.id, "accept")}
        >
          Annehmen
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={props.busy}
          aria-label={`Anfrage von ${who} ablehnen`}
          onClick={() => props.onAnswer(r.id, "decline")}
        >
          Ablehnen
        </Button>
      </span>
    </li>
  );
}

/**
 * The open requests (US-SOZ-01, US-SOZ-02): what waits for my answer with "Annehmen" and "Ablehnen", and what I sent.
 * Before acceptance only the display name is shown, never a collection (P-05). A request the other side declined shows
 * only "nicht angenommen". Without any request the section says what to do next (P-09).
 */
export function RequestList(props: {
  requests: OpenRequests;
  busy: boolean;
  onAnswer: (id: string, decision: "accept" | "decline") => void;
}) {
  const { incoming, outgoing } = props.requests;
  return (
    <section aria-labelledby="friend-requests-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-requests-title" className="text-xl font-semibold">
        Anfragen
      </h2>
      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-3">
          Keine offenen Anfragen. Erzeuge oben einen Code und gib ihn weiter, oder gib einen Code
          ein, den du bekommen hast.
        </p>
      )}
      {incoming.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Anfragen an dich">
          {incoming.map((r) => (
            <Incoming key={r.id} request={r} busy={props.busy} onAnswer={props.onAnswer} />
          ))}
        </ul>
      )}
      {outgoing.length > 0 && (
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label="Von dir gesendete Anfragen"
        >
          {outgoing.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
            >
              <span className="min-w-0 break-words">Anfrage an {nameOf(r.otherName)}</span>
              <Badge variant={r.status === "declined" ? "outline" : "secondary"}>
                {r.status === "declined" ? "Nicht angenommen" : "Wartet auf Antwort"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

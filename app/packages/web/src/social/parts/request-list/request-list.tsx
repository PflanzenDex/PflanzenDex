import type { FriendRequest, OpenRequests } from "@pflanzendex/core";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Badge } from "@/components/ui/display/badge/badge";
import { Button } from "@/components/ui/button/button";

/** A person without a stored display name stays unknown instead of being named by guess (P-08). */
export const nameOf = (name: string | null) => name ?? "Name unbekannt";

type Entry = { kind: "incoming" | "outgoing"; request: FriendRequest };

/** Requests per page in the layer (starting value, assumption; US-QS-20). */
const PAGE_SIZE = 4;

function Incoming(props: {
  request: FriendRequest;
  busy: boolean;
  onAnswer: (id: string, decision: "accept" | "decline") => void;
}) {
  const { request: r } = props;
  const who = nameOf(r.otherName);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="min-w-0 break-words">{who} möchte mit dir befreundet sein.</span>
      <span className="flex gap-2">
        <Button
          type="button"
          size="touch"
          variant="secondary"
          disabled={props.busy}
          aria-label={`Annehmen: Anfrage von ${who}`}
          onClick={() => props.onAnswer(r.id, "accept")}
        >
          Annehmen
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={props.busy}
          aria-label={`Ablehnen: Anfrage von ${who}`}
          onClick={() => props.onAnswer(r.id, "decline")}
        >
          Ablehnen
        </Button>
      </span>
    </div>
  );
}

function Outgoing({ request: r }: { request: FriendRequest }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <span className="min-w-0 break-words">Anfrage an {nameOf(r.otherName)}</span>
      <Badge variant={r.status === "declined" ? "outline" : "secondary"}>
        {r.status === "declined" ? "Nicht angenommen" : "Wartet auf Antwort"}
      </Badge>
    </div>
  );
}

/**
 * The open requests (US-SOZ-01, US-SOZ-02), the content of the layer "Anfragen" (US-QS-20): what waits for my answer with
 * "Annehmen" and "Ablehnen", and what I sent, in pages. Before acceptance only the display name is shown, never a
 * collection (P-05). A request the other side declined shows only "nicht angenommen". Without any request the section says
 * what to do next (P-09). "Annehmen" is the quiet filled kind, so the layer keeps one primary action (DS-58).
 */
export function RequestList(props: {
  requests: OpenRequests;
  busy: boolean;
  onAnswer: (id: string, decision: "accept" | "decline") => void;
}) {
  const { incoming, outgoing } = props.requests;
  const entries: Entry[] = [
    ...incoming.map((request): Entry => ({ kind: "incoming", request })),
    ...outgoing.map((request): Entry => ({ kind: "outgoing", request })),
  ];
  return (
    <section aria-label="Anfragen" className="flex min-w-0 flex-col gap-3">
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3">
          Keine offenen Anfragen. Mit „Freund hinzufügen“ lädst du jemanden ein.
        </p>
      ) : (
        <Pager
          items={entries}
          pageSize={PAGE_SIZE}
          label="Anfragen"
          getKey={(e) => e.request.id}
          renderItem={(e) =>
            e.kind === "incoming" ? (
              <Incoming request={e.request} busy={props.busy} onAnswer={props.onAnswer} />
            ) : (
              <Outgoing request={e.request} />
            )
          }
        />
      )}
    </section>
  );
}

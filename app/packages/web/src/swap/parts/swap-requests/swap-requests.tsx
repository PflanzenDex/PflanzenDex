import { useCallback, useState } from "react";
import type { SwapOverview, SwapSide } from "@pflanzendex/core";
import { errorText } from "@/lib/error-text";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { answerSwap, confirmHandover, loadSwaps, type AnswerInput } from "../../api/swaps-api";
import { SwapCard } from "./swap-card/swap-card";
import { swapTitle } from "./swap-text";

const KEY = ["swap", "swaps"] as const;
type Token = () => Promise<string | undefined>;

/** What the keeper reads after an answer: what happened and what comes next (P-09). */
function doneText(s: SwapSide, a: AnswerInput): string {
  const who = s.otherName ?? "dem Freund";
  const title = swapTitle(s);
  switch (a.action) {
    case "accept":
      return `Du hast die Anfrage von ${who} für ${title} angenommen. Das Angebot ist reserviert, weitere Anfragen dafür sind abgelehnt.`;
    case "decline":
      return `Du hast die Anfrage von ${who} für ${title} abgelehnt.`;
    case "propose":
      return `Dein Vorschlag an ${who} ist gesendet. Die Anfrage bleibt offen.`;
    case "cancel":
      return "Die Zusage ist zurückgezogen. Das Angebot ist wieder offen.";
    default:
      return "Deine Anfrage ist zurückgezogen.";
  }
}

/** What the keeper reads after confirming the handover: waiting for the other side, or done (P-09, P-10). */
function handoverText(s: SwapSide, status: "waiting" | "handed_over"): string {
  if (status === "waiting")
    return `Deine Bestätigung ist gespeichert. Sobald ${s.otherName ?? "der Freund"} auch bestätigt hat, wird übergeben.`;
  return s.role === "recipient"
    ? "Die Übergabe ist abgeschlossen. Das Exemplar ist jetzt in deinem Bestand."
    : "Die Übergabe ist abgeschlossen. Dein Exemplar ist archiviert, der Freund hat ein neues.";
}

function Section(props: {
  id: string;
  title: string;
  rows: readonly SwapSide[];
  busy: boolean;
  onAnswer: (s: SwapSide, a: AnswerInput) => void;
  onHandover: (s: SwapSide, marker: string | null) => void;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section aria-labelledby={props.id} className="flex min-w-0 flex-col gap-2">
      <h3 id={props.id} className="text-lg font-semibold">
        {props.title}
      </h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0" aria-label={props.title}>
        {props.rows.map((s) => (
          <SwapCard
            key={s.swapId}
            s={s}
            busy={props.busy}
            onAnswer={(a) => props.onAnswer(s, a)}
            onHandover={(m) => props.onHandover(s, m)}
          />
        ))}
      </ul>
    </section>
  );
}

function Body(props: { data: SwapOverview; api: string; token: Token; onWritten: () => void }) {
  const { data, api } = props;
  const write = useWriteAction(props.token, props.onWritten);
  // The handover answers `waiting` or `handed_over`, so its message depends on the answer (P-09).
  const [handed, setHanded] = useState<string | null>(null);
  const answer = (s: SwapSide, a: AnswerInput) => {
    setHanded(null);
    void write.run((t) => answerSwap({ api, token: t }, s.swapId, a), doneText(s, a));
  };
  const handover = (s: SwapSide, marker: string | null) => {
    setHanded(null);
    void write.run(async (t) => {
      const r = await confirmHandover({ api, token: t }, s.swapId, marker);
      if (r.ok) setHanded(handoverText(s, r.value.status));
      return r;
    }, "");
  };
  if (data.received.length === 0 && data.sent.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border p-3">
        Noch keine Anfragen. Sobald ein Freund dein Angebot anfragt oder du ein Angebot anfragst,
        siehst du den Stand hier.
      </p>
    );
  return (
    <>
      {(write.message || handed) && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message || handed}
        </p>
      )}
      {write.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {errorText(write.error.code)}
        </p>
      )}
      <Section
        id="swaps-received"
        title="Anfragen an dich"
        rows={data.received}
        busy={write.running}
        onAnswer={answer}
        onHandover={handover}
      />
      <Section
        id="swaps-sent"
        title="Deine Anfragen"
        rows={data.sent}
        busy={write.running}
        onAnswer={answer}
        onHandover={handover}
      />
    </>
  );
}

/**
 * The requests of the exchange (US-SOZ-10): the requests for my offers with the actions accept, decline (optionally
 * with a reason), propose something else and, once accepted, withdraw the acceptance; and the requests I sent with
 * their state and the option to withdraw them. Both sides see the same state; finished swaps stay with the reason or
 * the cause (P-10). Without any swap the section says what to do next (P-09).
 */
export function SwapRequests(props: { api: string; token: Token }) {
  const { api, token } = props;
  const reload = useInvalidate(KEY);
  const load = useCallback((t: string) => loadSwaps(api, t), [api]);
  return (
    <section aria-labelledby="swap-requests-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="swap-requests-title" className="text-xl font-semibold">
        Anfragen
      </h2>
      <LoadFrame queryKey={KEY} token={token} load={load} loadingText="Anfragen werden geladen …">
        {(data: SwapOverview) => <Body data={data} api={api} token={token} onWritten={reload} />}
      </LoadFrame>
    </section>
  );
}

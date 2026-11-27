import { useState } from "react";
import type { SwapSide } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { AnswerInput } from "../../../api/swaps-api";
import { MODE_TEXT, TYPE_TEXT } from "../../offer-form/health-text";
import { HandoverBox } from "../handover-box/handover-box";
import { ReasonForm } from "../reason-form/reason-form";
import { CAUSE_TEXT, STATUS_TEXT, swapTitle } from "../swap-text";

/** What the card says about the state: the reason of a decline, the cause of an automatic end, the giver's proposal. */
function Facts({ s }: { s: SwapSide }) {
  const who = s.otherName ?? "Ein Freund";
  return (
    <>
      <span className="text-sm">
        {who} · {TYPE_TEXT[s.type]} · {MODE_TEXT[s.mode]}
      </span>
      {s.proposal && s.role === "recipient" && s.counterText && (
        <span className="text-sm">
          Vorschlag von {who}: {s.counterText}
        </span>
      )}
      {!(s.proposal && s.role === "recipient") && s.counterName && (
        <span className="text-sm">Gegenangebot: {s.counterName}</span>
      )}
      {!(s.proposal && s.role === "recipient") && s.counterText && (
        <span className="text-sm">
          {s.proposal ? "Dein Vorschlag" : "Angebot"}: {s.counterText}
        </span>
      )}
      {s.cause && <span className="text-sm text-muted-foreground">{CAUSE_TEXT[s.cause]}.</span>}
      {s.reason && <span className="text-sm text-muted-foreground">Grund: {s.reason}</span>}
    </>
  );
}

type Mode = "decline" | "propose" | "cancel" | null;

function OpenButtons(props: {
  title: string;
  busy: boolean;
  onAccept: () => void;
  onMode: (m: Mode) => void;
}) {
  const { title } = props;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        className="flex-1"
        disabled={props.busy}
        aria-label={`Annehmen: ${title}`}
        onClick={props.onAccept}
      >
        Annehmen
      </Button>
      <Button
        type="button"
        variant="plain"
        className="flex-1"
        aria-label={`Ablehnen: ${title}`}
        onClick={() => props.onMode("decline")}
      >
        Ablehnen
      </Button>
      <Button
        type="button"
        variant="plain"
        className="w-full sm:w-auto"
        aria-label={`Anderes vorschlagen: ${title}`}
        onClick={() => props.onMode("propose")}
      >
        Anderes vorschlagen
      </Button>
    </div>
  );
}

/** The giver's actions on a request: accept, decline (reason optional), propose something else; cancel once accepted. */
function GiverActions(props: { s: SwapSide; busy: boolean; onAnswer: (a: AnswerInput) => void }) {
  const { s } = props;
  const [mode, setMode] = useState<Mode>(null);
  const title = swapTitle(s);
  const send = (input: AnswerInput) => {
    setMode(null);
    props.onAnswer(input);
  };
  if (mode === "decline")
    return (
      <ReasonForm
        label="Grund (optional)"
        submit="Ablehnung senden"
        required={false}
        busy={props.busy}
        onSend={(t) => send(t ? { action: "decline", reason: t } : { action: "decline" })}
        onCancel={() => setMode(null)}
      />
    );
  if (mode === "propose")
    return (
      <ReasonForm
        label="Was möchtest du statt dessen?"
        submit="Vorschlag senden"
        required
        busy={props.busy}
        onSend={(t) => send({ action: "propose", proposal: t })}
        onCancel={() => setMode(null)}
      />
    );
  if (s.status === "accepted")
    return (
      <Button
        type="button"
        variant="plain"
        className="w-full sm:w-auto"
        disabled={props.busy}
        aria-label={`Zusage zurückziehen: ${title}`}
        onClick={() => send({ action: "cancel" })}
      >
        Zusage zurückziehen
      </Button>
    );
  if (s.status !== "requested") return null;
  return (
    <OpenButtons
      title={title}
      busy={props.busy}
      onAccept={() => send({ action: "accept" })}
      onMode={setMode}
    />
  );
}

/** One swap as its owner sees it: the state in words, the facts and the actions that are possible now. */
export function SwapCard(props: {
  s: SwapSide;
  busy: boolean;
  onAnswer: (a: AnswerInput) => void;
  onHandover: (marker: string | null) => void;
}) {
  const { s } = props;
  const waiting = s.status === "requested" || s.status === "accepted";
  return (
    <div className="grid min-w-0 gap-1 break-words rounded-lg border border-border p-3">
      {/* The state stands in the title row: two whole cards fit the first screen of a phone (US-QS-32, SG-LIST-01). */}
      <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 font-semibold">{swapTitle(s)}</span>
        <Badge variant={waiting ? "default" : "outline"} className="shrink-0">
          {STATUS_TEXT[s.status]}
        </Badge>
      </span>
      <Facts s={s} />
      {s.role === "recipient" && waiting && (
        <span className="mt-1 flex">
          <Button
            type="button"
            variant="plain"
            className="w-full sm:w-auto"
            disabled={props.busy}
            aria-label={`Anfrage zurückziehen: ${swapTitle(s)}`}
            onClick={() => props.onAnswer({ action: "withdraw" })}
          >
            Anfrage zurückziehen
          </Button>
        </span>
      )}
      <HandoverBox s={s} busy={props.busy} onConfirm={props.onHandover} />
      {s.role === "giver" && <GiverActions s={s} busy={props.busy} onAnswer={props.onAnswer} />}
    </div>
  );
}

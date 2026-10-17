import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { errorText } from "@/lib/error-text";
import { LoadFrame, SIGN_IN, useInvalidate, type ApiError } from "../../kernel";
import { cancelDeletion, loadDeletion, requestDeletion, type DeletionState } from "../privacy-api";
import { ConfirmModal, WhatHappens } from "./confirm-modal/confirm-modal";

type Token = () => Promise<string | undefined>;

const KEY = ["account", "deletion"] as const;

const ALERT =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

/** Sends one request at a time (a double tap sends one); a refusal stays visible, nothing is shown as done (P-10). */
function useDeletionAction(props: { api: string; token: Token; state: DeletionState }) {
  const [state, setState] = useState(props.state);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const refresh = useInvalidate(KEY);
  const send = async (
    action: (api: string, token: string) => ReturnType<typeof requestDeletion>,
    done: string,
  ) => {
    if (busy.current) return false;
    busy.current = true;
    setRunning(true);
    const t = await props.token();
    const r = t ? await action(props.api, t) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? done : null);
    if (r.ok) setState(r.value);
    refresh();
    return true;
  };
  return { state, running, message, error, send };
}

function Requested(props: { dueAt: string; running: boolean; onCancel: () => void }) {
  return (
    <>
      <p role="status" className="m-0 rounded-lg border border-border p-3">
        Die Löschung ist vorgemerkt: Dein Konto und alle deine Daten werden am{" "}
        <strong>{day(props.dueAt)}</strong> gelöscht. Bis dahin ändert sich nichts. Willst du sie
        behalten, nimm die Löschung zurück.
      </p>
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={props.running}
        onClick={props.onCancel}
      >
        Löschung zurücknehmen
      </Button>
    </>
  );
}

function NotRequested(props: { running: boolean; onConfirm: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WhatHappens />
      <Button
        type="button"
        variant="destructive"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        Konto löschen …
      </Button>
      <ConfirmModal
        open={open}
        onOpenChange={setOpen}
        running={props.running}
        onConfirm={() => void props.onConfirm().then(() => setOpen(false))}
      />
    </>
  );
}

function DeletionView(props: { api: string; token: Token; state: DeletionState }) {
  const { state, running, message, error, send } = useDeletionAction(props);
  return (
    <div className="flex min-w-0 max-w-xl flex-col gap-3 rounded-card bg-card p-5 shadow-elevation-1">
      <h3 className="m-0 text-lg font-semibold">Konto löschen</h3>
      {state.requested ? (
        <Requested
          dueAt={state.dueAt}
          running={running}
          onCancel={() =>
            void send(cancelDeletion, "Die Löschung ist zurückgenommen. Dein Konto bleibt.")
          }
        />
      ) : (
        <NotRequested
          running={running}
          onConfirm={() => send(requestDeletion, "Die Löschung ist vorgemerkt.")}
        />
      )}
      {error && (
        <p role="alert" className={ALERT}>
          {error.code === "network.not_reachable" ? error.text : errorText(error.code)}
        </p>
      )}
      {message && !state.requested && (
        <p role="status" className="rounded-lg border border-border p-3">
          {message}
        </p>
      )}
    </div>
  );
}

/** Deleting the own account with a grace period (US-ACC-04). Names what goes and what stays, then asks for a confirmation. */
export function DeletionCard(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadDeletion(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      fresh
      token={props.token}
      load={load}
      loadingText="Löschung wird geladen …"
    >
      {(state) => <DeletionView api={props.api} token={props.token} state={state} />}
    </LoadFrame>
  );
}

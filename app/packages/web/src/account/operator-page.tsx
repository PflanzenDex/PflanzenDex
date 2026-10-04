import type { CreatedInvitation, OperatorOverview } from "@pflanzendex/core";
import { useCallback, useRef, useState } from "react";
import { LoadFrame, SIGN_IN, type ApiError, type Response } from "../kernel";
import { createInvitation, loadOverview, setRegistrationMode } from "./access-api";
import { InvitationForm, InvitationList, ModeSection, NewCode } from "./operator-parts";
import "./operator.css";

type Token = () => Promise<string | undefined>;

/** One write at a time (a double tap sends one); a refusal stays visible (P-10), the page reloads afterwards. */
function useOperatorActions(api: string, token: Token) {
  const [refresh, setRefresh] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const busy = useRef(false);

  const run = async <T,>(send: (t: string) => Promise<Response<T>>, done: (value: T) => string) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    const t = await token();
    const r = t ? await send(t) : { ok: false as const, error: SIGN_IN };
    busy.current = false;
    setRunning(false);
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? done(r.value) : null);
    if (r.ok) setRefresh((n) => n + 1);
  };

  return {
    refresh,
    running,
    message,
    error,
    created,
    setMode: (on: boolean) =>
      run(
        (t) => setRegistrationMode(api, t, on),
        (v) =>
          v.invitationOnly
            ? "Registrierung: ab jetzt nur mit Einladungscode."
            : "Registrierung: ab jetzt offen für alle.",
      ),
    create: (days: number) =>
      run(
        (t) => createInvitation(api, t, days),
        (v) => {
          setCreated(v);
          return "Einladungscode erstellt.";
        },
      ),
  };
}

function Numbers(props: { overview: OperatorOverview }) {
  const o = props.overview;
  return (
    <section aria-label="Zahlen">
      <dl className="facts">
        <dt>Konten</dt>
        <dd>{o.accounts}</dd>
        <dt>{`Aktive Nutzer (letzte ${o.activeWindowDays} Tage)`}</dt>
        <dd>{o.activeAccounts}</dd>
        <dt>Kosten pro Nutzer</dt>
        <dd>
          {o.costPerUser === null
            ? "unbekannt (die Kostenmessung gibt es noch nicht)"
            : o.costPerUser}
        </dd>
      </dl>
      <p className="quiet">Du siehst nur Zahlen, nie Inhalte einzelner Konten.</p>
    </section>
  );
}

/** The operator area (US-ACC-05): counts, registration mode and invitation codes; no content of any account (P-05). */
export function OperatorPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const actions = useOperatorActions(api, token);
  const load = useCallback((t: string) => loadOverview(api, t), [api]);
  return (
    <div className="operator">
      <h1>Betreiber</h1>
      {actions.message && (
        <p role="status" className="hint">
          {actions.message}
        </p>
      )}
      {actions.error && (
        <p role="alert" className="warning">
          {actions.error.text}
        </p>
      )}
      <LoadFrame
        token={token}
        load={load}
        loadingText="Zahlen werden geladen …"
        refresh={actions.refresh}
      >
        {(overview: OperatorOverview) => (
          <>
            <Numbers overview={overview} />
            <ModeSection
              invitationOnly={overview.invitationOnly}
              running={actions.running}
              onChange={(on) => void actions.setMode(on)}
            />
            <section aria-labelledby="codes-title">
              <h2 id="codes-title">Einladungscodes</h2>
              <InvitationForm running={actions.running} onCreate={(d) => void actions.create(d)} />
              {actions.created && <NewCode created={actions.created} />}
              <InvitationList invitations={overview.invitations} />
            </section>
          </>
        )}
      </LoadFrame>
    </div>
  );
}

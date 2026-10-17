import type { CreatedInvitation, OperatorCostFigure, OperatorOverview } from "@pflanzendex/core";
import { useCallback, useRef, useState } from "react";
import { LoadFrame, SIGN_IN, useInvalidate, type ApiError, type Response } from "../../../kernel";
import {
  createInvitation,
  loadOverview,
  setOperatorCost,
  setRegistrationMode,
} from "../../api/access-api";
import { CostForm, costPerUserText, moneyText, monthText } from "../operator-cost/operator-cost";
import { InvitationsArea, ModeSection } from "../operator-parts/operator-parts";
import { OperatorPageSkeleton } from "./operator-page.skeleton";
import { refusalText } from "../../refusal";

type Token = () => Promise<string | undefined>;
const OPERATOR_KEY = ["account", "operator"] as const;

/** One write at a time (a double tap sends one); a refusal stays visible (P-10), the page reloads afterwards. */
function useOperatorActions(api: string, token: Token) {
  const invalidate = useInvalidate(OPERATOR_KEY);
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
    if (r.ok) invalidate();
  };

  return {
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
    setCost: (figure: OperatorCostFigure) =>
      run(
        (t) => setOperatorCost(api, t, figure),
        () => "Monatliche Kosten gespeichert.",
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
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-muted-foreground sm:text-base">Konten</dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">{o.accounts}</dd>
        <dt className="text-sm text-muted-foreground sm:text-base">{`Aktive Nutzer (letzte ${o.activeWindowDays} Tage)`}</dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">{o.activeAccounts}</dd>
        <dt className="text-sm text-muted-foreground sm:text-base">Monatliche Kosten</dt>
        <dd className="m-0 mb-2 font-semibold [overflow-wrap:anywhere] sm:mb-0">
          {o.cost
            ? `${moneyText(o.cost.amountCents, o.cost.currency)} (${monthText(o.cost.month)})`
            : "nicht eingetragen"}
        </dd>
        <dt className="text-sm text-muted-foreground sm:text-base">Kosten pro Nutzer</dt>
        <dd className="m-0 font-semibold [overflow-wrap:anywhere]">
          {costPerUserText(o.costPerUser)}
        </dd>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Du siehst nur Zahlen, nie Inhalte einzelner Konten.
      </p>
    </section>
  );
}

function CostSection(props: {
  cost: OperatorOverview["cost"];
  running: boolean;
  onSave: (figure: OperatorCostFigure) => void;
}) {
  return (
    <section aria-labelledby="cost-title" className="flex flex-col gap-3">
      <h2 id="cost-title" className="text-xl font-semibold">
        Monatliche Kosten
      </h2>
      <p className="text-sm text-muted-foreground">
        Trage die echten Hosting-Kosten eines Monats ein. Die Kosten pro Nutzer sind dieser Betrag
        geteilt durch die aktiven Nutzer.
      </p>
      <CostForm cost={props.cost} running={props.running} onSave={props.onSave} />
    </section>
  );
}

/** The operator area (US-ACC-05): counts, registration mode and invitation codes; no content of any account (P-05). */
export function OperatorPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const actions = useOperatorActions(api, token);
  const load = useCallback((t: string) => loadOverview(api, t), [api]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold">Betreiber</h1>
      {actions.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {actions.message}
        </p>
      )}
      {actions.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {refusalText(actions.error)}
        </p>
      )}
      <LoadFrame
        queryKey={[...OPERATOR_KEY, "overview"]}
        token={token}
        load={load}
        loadingText="Zahlen werden geladen …"
        loadingFallback={<OperatorPageSkeleton label="Zahlen werden geladen …" />}
      >
        {(overview: OperatorOverview) => (
          <>
            <Numbers overview={overview} />
            <CostSection
              cost={overview.cost}
              running={actions.running}
              onSave={(f) => void actions.setCost(f)}
            />
            <ModeSection
              invitationOnly={overview.invitationOnly}
              running={actions.running}
              onChange={(on) => void actions.setMode(on)}
            />
            <section aria-labelledby="codes-title" className="flex flex-col gap-3">
              <h2 id="codes-title" className="text-xl font-semibold">
                Einladungscodes
              </h2>
              <InvitationsArea
                running={actions.running}
                created={actions.created}
                invitations={overview.invitations}
                onCreate={(d) => void actions.create(d)}
              />
            </section>
          </>
        )}
      </LoadFrame>
    </div>
  );
}

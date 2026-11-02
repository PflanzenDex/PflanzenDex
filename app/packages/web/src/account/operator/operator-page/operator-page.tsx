import type { OperatorOverview } from "@pflanzendex/core";
import { useCallback } from "react";
import { LayerHost, LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { MoreHelp } from "@/components/ui/display/more-help/more-help";
import { LoadFrame } from "../../../kernel";
import { loadOverview } from "../../api/access-api";
import { IntroductionSection } from "../introduction-section/introduction-section";
import { CostForm, costPerUserText, moneyText, monthText } from "../operator-cost/operator-cost";
import { InvitationsArea, ModeSection, OperatorRow } from "../operator-parts/operator-parts";
import { OperatorPageSkeleton } from "./operator-page.skeleton";
import { refusalText } from "../../refusal";
import { keepTogether } from "@/lib/format";
import {
  OPERATOR_KEY,
  useOperatorActions,
  type Actions,
  type Notice,
  type Scope,
  type Token,
} from "./operator-actions";

/** The monthly cost as the operator entered it, or "nicht eingetragen" (P-08). */
const costText = (cost: OperatorOverview["cost"]): string =>
  cost
    ? `${moneyText(cost.amountCents, cost.currency)} (${monthText(cost.month)})`
    : "nicht eingetragen";

/** The outcome of the last write, when it belongs to this layer. */
function LayerNotice({ notice, scope }: { notice: Notice | null; scope: Scope }) {
  if (notice?.scope !== scope) return null;
  return (
    <>
      {notice.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {notice.message}
        </p>
      )}
      {notice.error && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
          {refusalText(notice.error)}
        </p>
      )}
    </>
  );
}

function Numbers(props: { overview: OperatorOverview }) {
  const o = props.overview;
  return (
    <section aria-label="Zahlen">
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-muted-foreground sm:text-base">Konten</dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">{o.accounts}</dd>
        <dt className="text-sm text-muted-foreground sm:text-base">
          {keepTogether(`Aktive Nutzer (letzte ${o.activeWindowDays} Tage)`)}
        </dt>
        <dd className="m-0 mb-2 font-semibold sm:mb-0">{o.activeAccounts}</dd>
        <dt className="text-sm text-muted-foreground sm:text-base">Monatliche Kosten</dt>
        <dd className="m-0 mb-2 font-semibold [overflow-wrap:anywhere] sm:mb-0">
          {costText(o.cost)}
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

function CostLayer(props: { overview: OperatorOverview; actions: Actions }) {
  return (
    <div className="flex flex-col gap-3">
      <LayerNotice notice={props.actions.notice} scope="cost" />
      <MoreHelp more="Die Kosten pro Nutzer sind dieser Betrag geteilt durch die aktiven Nutzer.">
        Trage die echten Hosting-Kosten eines Monats ein.
      </MoreHelp>
      <CostForm
        cost={props.overview.cost}
        running={props.actions.running}
        onSave={(f) => void props.actions.setCost(f)}
      />
    </div>
  );
}

/** The current value of each topic, shown on the overview row (P-09): the next step is in its layer. */
function Rows(props: { overview: OperatorOverview }) {
  const o = props.overview;
  const open = o.invitations.filter((i) => i.status === "open").length;
  return (
    <div className="flex min-w-0 max-w-xl flex-1 flex-col">
      <OperatorRow
        id="zahlen"
        title="Zahlen"
        value={`${o.accounts} Konten · ${o.activeAccounts} aktiv`}
      />
      <OperatorRow
        id="einstieg"
        title="Einstieg"
        value="Dauer und Schritte beim Einstieg neuer Konten"
      />
      <OperatorRow id="kosten" title="Monatliche Kosten" value={costText(o.cost)} />
      <OperatorRow
        id="registrierung"
        title="Registrierung"
        value={o.invitationOnly ? "nur mit Einladungscode" : "offen für alle"}
      />
      <OperatorRow
        id="einladungscodes"
        title="Einladungscodes"
        value={
          o.invitations.length === 0
            ? "noch keine"
            : `${open} offen · ${o.invitations.length} insgesamt`
        }
      />
    </div>
  );
}

/** Each topic opens as a layer (US-QS-15): the figures, the introduction, the cost, the mode and the codes. */
function Layers(props: {
  api: string;
  token: Token;
  overview: OperatorOverview;
  actions: Actions;
}) {
  const { api, token, overview, actions } = props;
  return (
    <>
      <LayerSheet id="zahlen" title="Zahlen">
        <Numbers overview={overview} />
      </LayerSheet>
      <LayerSheet id="einstieg" title="Einstieg">
        <IntroductionSection api={api} token={token} />
      </LayerSheet>
      <LayerSheet id="kosten" title="Monatliche Kosten">
        <CostLayer overview={overview} actions={actions} />
      </LayerSheet>
      <LayerSheet id="registrierung" title="Registrierung">
        <div className="flex flex-col gap-3">
          <LayerNotice notice={actions.notice} scope="mode" />
          <ModeSection
            invitationOnly={overview.invitationOnly}
            running={actions.running}
            onChange={(on) => void actions.setMode(on)}
          />
        </div>
      </LayerSheet>
      <LayerSheet id="einladungscodes" title="Einladungscodes">
        <div className="flex flex-col gap-3">
          <LayerNotice notice={actions.notice} scope="codes" />
          <InvitationsArea
            running={actions.running}
            created={actions.created}
            invitations={overview.invitations}
            onCreate={(d) => void actions.create(d)}
          />
        </div>
      </LayerSheet>
    </>
  );
}

/**
 * The operator area (US-ACC-05, US-QS-15): one row per topic with its current value; each topic opens as a layer. No
 * content of any account (P-05). On a wide screen the layer stands beside the rows.
 */
export function OperatorPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const actions = useOperatorActions(api, token);
  const load = useCallback((t: string) => loadOverview(api, t), [api]);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold">Betreiber</h1>
      <LoadFrame
        queryKey={[...OPERATOR_KEY, "overview"]}
        token={token}
        load={load}
        loadingText="Zahlen werden geladen …"
        loadingFallback={<OperatorPageSkeleton label="Zahlen werden geladen …" />}
      >
        {(overview: OperatorOverview) => (
          <LayerHost>
            <Rows overview={overview} />
            <Layers api={api} token={token} overview={overview} actions={actions} />
          </LayerHost>
        )}
      </LoadFrame>
    </div>
  );
}

import type { LampLight, LampLightView } from "@pflanzendex/core";
import { DataForm } from "./data-form/data-form";
import { LimitForm } from "./limit-form/limit-form";
import { MeasureForm } from "./measure-form/measure-form";
import { lux } from "./parse";
import type { MeasurementInput } from "../equipment-api";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { keepTogether } from "@/lib/format";
import { zoneLabel } from "@pflanzendex/core";

export interface LampLightActions {
  busy: boolean;
  onMeasure: (lamp: LampLight, input: MeasurementInput) => Promise<boolean>;
  onData: (lamp: LampLight, data: { powerW: number | null; luxStatement: number | null }) => void;
  onLimit: (percent: number | null) => void;
}

const UNKNOWN = "unbekannt";
/** Lamps per page of the layer (starting value, assumption; the page size from the free height is #1029). */
const LAMPS_PER_PAGE = 4;

/** The measured value apart from the manufacturer's statement; without a measurement the zone value applies (FR-LIC-06). */
function Values({ lamp }: { lamp: LampLight }) {
  const last = lamp.last;
  const detail = last
    ? [
        last.distanceCm !== null ? keepTogether(`Abstand ${last.distanceCm} cm`) : null,
        last.method,
      ].filter(Boolean)
    : [];
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm tabular-nums">
      <dt>Herstellerangabe</dt>
      <dd className="m-0">{lamp.manufacturerLux === null ? UNKNOWN : lux(lamp.manufacturerLux)}</dd>
      <dt>Leistung</dt>
      <dd className="m-0">{lamp.powerW === null ? UNKNOWN : `${lamp.powerW} W`}</dd>
      <dt>Gemessen</dt>
      <dd className="m-0">
        {last
          ? `${lux(last.lux)} am ${last.measuredOn}${detail.length ? ` (${detail.join(", ")})` : ""}`
          : "nicht gemessen"}
      </dd>
      <dt>Es gilt</dt>
      <dd className="m-0">
        {lamp.effective === null
          ? UNKNOWN
          : lamp.effective.basis === "measured"
            ? `${lux(lamp.effective.lux)} (gemessen)`
            : `${lux(lamp.effective.lux)} (Wert der Zone, nicht gemessen)`}
      </dd>
    </dl>
  );
}

function History({ lamp }: { lamp: LampLight }) {
  if (lamp.measurements.length < 2) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">Alle Messungen ({lamp.measurements.length})</summary>
      <ul className="m-0 mt-1 list-none p-0">
        {lamp.measurements.map((m) => (
          <li key={m.id}>
            {m.measuredOn}: {lux(m.lux)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function LampCard({ lamp, actions }: { lamp: LampLight; actions: LampLightActions }) {
  const where = lamp.zone ? zoneLabel(lamp.zone.name) : "ohne Zone";
  return (
    <details
      className="min-w-0 rounded-lg border border-border"
      open={lamp.check ? true : undefined}
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 p-3">
        <span className="break-words font-semibold">{lamp.name}</span>
        <span className="text-sm text-muted-foreground">
          {lamp.powerW === null ? UNKNOWN : `${lamp.powerW} W`} · {where}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {lamp.zone ? (
          <p className="text-sm text-muted-foreground">Obergrenze {lux(lamp.zone.luxCeiling)}</p>
        ) : null}
        {lamp.check ? (
          <p
            role="alert"
            className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
          >
            <strong>Zone prüfen.</strong> {lamp.check.text} <strong>{lamp.check.nextAction}</strong>
          </p>
        ) : null}
        <Values lamp={lamp} />
        <History lamp={lamp} />
        <MeasureForm
          lampName={lamp.name}
          busy={actions.busy}
          onSend={(input) => actions.onMeasure(lamp, input)}
        />
        <details>
          <summary className="cursor-pointer text-sm">Herstellerangabe ändern</summary>
          <div className="mt-2">
            <DataForm
              lampName={lamp.name}
              powerW={lamp.powerW}
              luxStatement={lamp.manufacturerLux}
              busy={actions.busy}
              onSend={(data) => actions.onData(lamp, data)}
            />
          </div>
        </details>
      </div>
    </details>
  );
}

/**
 * The light intensity per lamp (US-EQU-03, FR-LIC-06): manufacturer value and measurement apart, "nicht gemessen" without
 * a measurement, "Zone prüfen" only against the limit the keeper set. Nothing here is estimated (P-08).
 */
export function LampLightView({
  view,
  actions,
}: {
  view: LampLightView;
  actions: LampLightActions;
}) {
  if (view.lamps.length === 0) return null;
  return (
    <section aria-labelledby="lamp-light-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="lamp-light-title" className="text-base font-semibold">
        Lichtstärke der Lampen
      </h2>
      <Pager
        items={view.lamps}
        pageSize={LAMPS_PER_PAGE}
        label="Lichtstärke je Lampe"
        param={LAYER_PARAM}
        getKey={(l) => l.id}
        renderItem={(l) => <LampCard lamp={l} actions={actions} />}
      />
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer p-3 text-sm">
          Abweichungsgrenze {view.limit === null ? "(nicht festgelegt)" : `(${view.limit} %)`}
        </summary>
        <div className="px-3 pb-3">
          <LimitForm
            key={String(view.limit)}
            limit={view.limit}
            busy={actions.busy}
            onSend={actions.onLimit}
          />
        </div>
      </details>
    </section>
  );
}

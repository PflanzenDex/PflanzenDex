import type { LampLight, LampLightView } from "@pflanzendex/core";
import { DataForm } from "./data-form/data-form";
import { LimitForm } from "./limit-form/limit-form";
import { MeasureForm } from "./measure-form/measure-form";
import { lux } from "./parse";
import type { MeasurementInput } from "../equipment-api";
import { keepTogether } from "@/lib/format";

export interface LampLightActions {
  busy: boolean;
  onMeasure: (lamp: LampLight, input: MeasurementInput) => Promise<boolean>;
  onData: (lamp: LampLight, data: { powerW: number | null; luxStatement: number | null }) => void;
  onLimit: (percent: number | null) => void;
}

const UNKNOWN = "unbekannt";

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
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
      <div>
        <h3 className="break-words font-semibold">{lamp.name}</h3>
        <p className="text-sm text-muted-foreground">
          {lamp.zone ? `${lamp.zone.name} · Obergrenze ${lux(lamp.zone.luxCeiling)}` : "ohne Zone"}
        </p>
      </div>
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
    </li>
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
      <h2 id="lamp-light-title" className="text-xl font-semibold">
        Lichtstärke der Lampen
      </h2>
      <LimitForm
        key={String(view.limit)}
        limit={view.limit}
        busy={actions.busy}
        onSend={actions.onLimit}
      />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
        {view.lamps.map((l) => (
          <LampCard key={l.id} lamp={l} actions={actions} />
        ))}
      </ul>
    </section>
  );
}

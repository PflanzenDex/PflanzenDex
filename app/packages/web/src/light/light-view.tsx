import { EmptyState } from "@/components/shared/empty-state";
import { DerivationForm, type Derive } from "./derivation-view";
import { Fresh, useFresh } from "./fresh";
import type { ApiError, LightData } from "./light-api";
import { LocationForm, LocationCard, type LocationInput } from "./locations-view";
import { ErrorMessage } from "./message";
import { ZoneForm, ZoneCard, type ZoneInput } from "./zones-view";

type AppError = Promise<ApiError | null>;

export interface LightActions {
  zoneCreate: (e: ZoneInput) => AppError;
  zoneUpdate: (id: string, e: ZoneInput) => AppError;
  zoneDelete: (id: string) => AppError;
  defaults: () => AppError;
  locationCreate: (e: LocationInput) => AppError;
  locationUpdate: (id: string, e: LocationInput) => AppError;
  zoneDerive: Derive;
}

const SECTION = "flex min-w-0 flex-col gap-3";
const H2 = "text-xl font-semibold";
const QUIET = "text-sm text-muted-foreground";
const LIST = "m-0 flex min-w-0 list-none flex-col gap-3 p-0";

/** Hints (US-BES-08): every hint says what to do (P-09). */
function Hints({ data }: { data: LightData }) {
  if (data.hints.length === 0) return null;
  return (
    <section
      aria-labelledby="hints"

      className="min-w-0 rounded-lg border border-warning-border bg-warning px-4 pb-3 pt-1 text-warning-foreground"
    >
      <h2 id="hints" className={`${H2} my-3`}>
        Hinweise
      </h2>
      <ul className="m-0 list-disc pl-5">
        {data.hints.map((h) => (
          <li key={h.locationId}>
            {h.text} {h.nextAction}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Zones(props: { data: LightData; actions: LightActions }) {
  const { data, actions } = props;
  const fresh = useFresh();
  return (
    <section aria-labelledby="zones" className={SECTION}>
      <h2 id="zones" className={H2}>
        Lichtzonen
      </h2>
      {data.zones.length === 0 ? (
        <EmptyState
          title="Noch keine Lichtzonen"
          description="Übernimm die vier Standard-Lampen oder lege unten eine eigene Zone an."
          action={{ label: "Standard-Lampen übernehmen", onClick: () => void actions.defaults() }}
        />
      ) : (
        <ul className={LIST}>
          {data.zones.map((z) => (
            <ZoneCard
              key={z.id}
              zone={z}
              onUpdate={(e) => actions.zoneUpdate(z.id, e)}
              onDelete={() => actions.zoneDelete(z.id)}
            />
          ))}
        </ul>
      )}
      <Fresh title="Neue Lichtzone" open={data.zones.length === 0} fresh={fresh}>
        <ZoneForm onSave={actions.zoneCreate} />
      </Fresh>
    </section>
  );
}

function Locations(props: { data: LightData; actions: LightActions }) {
  const { data, actions } = props;
  const fresh = useFresh();
  return (
    <section aria-labelledby="locations" className={SECTION}>
      <h2 id="locations" className={H2}>
        Standorte
      </h2>
      {data.locations.length === 0 ? (
        <EmptyState
          title="Noch keine Standorte"
          description="Lege einen Platz an, z. B. „Fensterbank“, und ordne ihm eine Lichtzone zu."
          action={{ label: "Ersten Standort anlegen", onClick: fresh.openAndFocus }}
        />
      ) : (
        <ul className={LIST}>
          {data.locations.map((s) => (
            <LocationCard
              key={s.id}
              location={s}
              zones={data.zones}
              onUpdate={(e) => actions.locationUpdate(s.id, e)}
            />
          ))}
        </ul>
      )}
      <Fresh title="Neuer Standort" fresh={fresh}>
        <LocationForm zones={data.zones} onSave={actions.locationCreate} />
      </Fresh>
    </section>
  );
}

function Assignment({ actions }: { actions: LightActions }) {
  return (
    <section aria-labelledby="assignment" className={SECTION}>
      <h2 id="assignment" className={H2}>
        Zone einer Art ermitteln
      </h2>
      <p className={QUIET}>
        Die Zone folgt dem Lux-Bedarf der Art und deinen Lichtzonen. Stecklingslicht ist nie das
        Ziel für erwachsene Pflanzen.
      </p>
      <DerivationForm onDerive={actions.zoneDerive} />
    </section>
  );
}

export function LightView(props: { data: LightData; actions: LightActions; error?: ApiError }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-lg border border-border bg-card p-4 text-card-foreground md:p-7">
      <h1 className="text-2xl font-semibold">Standorte und Lichtzonen</h1>
      <p>
        Hier bildest du deinen Aufbau ab: wo deine Pflanzen stehen und wie viel Licht dort ankommt.
      </p>
      {props.error && <ErrorMessage error={props.error} />}
      <Hints data={props.data} />
      <Zones data={props.data} actions={props.actions} />
      <Locations data={props.data} actions={props.actions} />
      <Assignment actions={props.actions} />
    </div>
  );
}

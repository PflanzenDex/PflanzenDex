import { DerivationForm, type Derive } from "./derivation-view";
import type { ApiError, LightData } from "./light-api";
import { LocationForm, LocationCard, type LocationInput } from "./locations-view";
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

/** Hints (US-BES-08): every hint says what to do (P-09). */
function Hints({ data }: { data: LightData }) {
  if (data.hints.length === 0) return null;
  return (
    <section aria-labelledby="hints" className="hints">
      <h2 id="hints">Hinweise</h2>
      <ul>
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
  return (
    <section aria-labelledby="zones">
      <h2 id="zones">Lichtzonen</h2>
      {data.zones.length === 0 ? (
        <div className="empty">
          <p>
            Noch keine Lichtzonen. Übernimm die vier Standard-Lampen oder lege unten eine eigene
            Zone an.
          </p>
          <div className="actions">
            <ButtonDefault onClick={actions.defaults} />
          </div>
        </div>
      ) : (
        <ul className="list">
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
      <details className="fresh" open={data.zones.length === 0}>
        <summary>Neue Lichtzone</summary>
        <ZoneForm onSave={actions.zoneCreate} />
      </details>
    </section>
  );
}

function ButtonDefault({ onClick }: { onClick: () => AppError }) {
  return (
    <button type="button" className="primary" onClick={() => void onClick()}>
      Standard-Lampen übernehmen
    </button>
  );
}

function Locations(props: { data: LightData; actions: LightActions }) {
  const { data, actions } = props;
  return (
    <section aria-labelledby="locations">
      <h2 id="locations">Standorte</h2>
      {data.locations.length === 0 ? (
        <p className="empty">
          Noch keine Standorte. Lege einen Platz an, z. B. „Fensterbank“, und ordne ihm eine
          Lichtzone zu.
        </p>
      ) : (
        <ul className="list">
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
      <details className="fresh">
        <summary>Neuer Standort</summary>
        <LocationForm zones={data.zones} onSave={actions.locationCreate} />
      </details>
    </section>
  );
}

function Assignment({ actions }: { actions: LightActions }) {
  return (
    <section aria-labelledby="assignment">
      <h2 id="assignment">Zone einer Art ermitteln</h2>
      <p className="quiet">
        Die Zone folgt dem Lux-Bedarf der Art und deinen Lichtzonen. Stecklingslicht ist nie das
        Ziel für erwachsene Pflanzen.
      </p>
      <DerivationForm onDerive={actions.zoneDerive} />
    </section>
  );
}

export function LightView(props: { data: LightData; actions: LightActions; error?: ApiError }) {
  return (
    <div className="light">
      <h1>Standorte und Lichtzonen</h1>
      <p className="lead">
        Hier bildest du deinen Aufbau ab: wo deine Pflanzen stehen und wie viel Licht dort ankommt.
      </p>
      {props.error && (
        <p role="alert" className="warning">
          {props.error.text}
        </p>
      )}
      <Hints data={props.data} />
      <Zones data={props.data} actions={props.actions} />
      <Locations data={props.data} actions={props.actions} />
      <Assignment actions={props.actions} />
    </div>
  );
}

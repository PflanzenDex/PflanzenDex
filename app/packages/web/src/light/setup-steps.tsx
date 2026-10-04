import { useCallback, useState, type ReactNode } from "react";
import { LoadFrame } from "../kernel";
import { createWrite, loadLight, type ApiError, type LightData } from "./light-api";
import { LocationCard, LocationForm, type LocationInput } from "./locations-view";
import { ErrorMessage } from "./message";
import { kindText } from "./text";

type Token = () => Promise<string | undefined>;
interface StepProps {
  api: string;
  token: Token;
  /** Leaves the step, with or without data: every step can be skipped (US-ACC-03). */
  onNext: () => void;
}

const SIGN_IN: ApiError = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

/** Loads the light data of the account and offers writes that reload it afterwards (never guess the new state). */
function useSetup(api: string, token: Token, isDone: (d: LightData) => boolean) {
  const [refresh, setRefresh] = useState(0);
  const [done, setDone] = useState(false);
  const load = useCallback(
    async (t: string) => {
      const r = await loadLight(api, t);
      if (r.ok) setDone(isDone(r.value));
      return r;
    },
    [api, isDone],
  );
  const write = async (method: "POST" | "PUT", path: string, body: unknown) => {
    const t = await token();
    if (!t) return SIGN_IN;
    const r = await createWrite(api, t)(method, path, body);
    if (r.ok) setRefresh((n) => n + 1);
    return r.ok ? null : r.error;
  };
  return { load, refresh, write, done };
}

const HAS_LOCATIONS = (d: LightData) => d.locations.length > 0;
const HAS_ZONES = (d: LightData) => d.zones.length > 0;

function Frame(props: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="onboarding-step">
      <h2>{props.title}</h2>
      <p className="quiet">{props.intro}</p>
      {props.children}
    </section>
  );
}

function Leave(props: { done: boolean; onNext: () => void }) {
  return (
    <div className="actions">
      <button type="button" className={props.done ? "primary" : "secondary"} onClick={props.onNext}>
        {props.done ? "Weiter" : "Überspringen"}
      </button>
    </div>
  );
}

/** Onboarding, step "locations": where the plants stand (US-ACC-03). The zone can follow in the next step. */
export function LocationsStep(props: StepProps) {
  const { load, refresh, write, done } = useSetup(props.api, props.token, HAS_LOCATIONS);
  return (
    <Frame
      title="Wo stehen deine Pflanzen?"
      intro="Lege Standorte an, zum Beispiel Fensterbank oder Balkon. Du kannst das auch später tun."
    >
      <LoadFrame
        token={props.token}
        load={load}
        loadingText="Standorte werden geladen …"
        refresh={refresh}
      >
        {(data: LightData) => (
          <>
            {data.locations.length > 0 && (
              <ul className="list">
                {data.locations.map((l) => (
                  <li key={l.id} className="entry">
                    <h3>{l.name}</h3>
                    <p className="quiet">{kindText(l.kind)}</p>
                  </li>
                ))}
              </ul>
            )}
            <LocationForm
              zones={data.zones}
              onSave={(e: LocationInput) => write("POST", "/locations", e)}
            />
          </>
        )}
      </LoadFrame>
      <Leave done={done} onNext={props.onNext} />
    </Frame>
  );
}

function DefaultsButton(props: { onTake: () => Promise<ApiError | null> }) {
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <>
      {error && <ErrorMessage error={error} />}
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => void props.onTake().then(setError)}
        >
          Standard-Lampen übernehmen
        </button>
      </div>
    </>
  );
}

/** Onboarding, step "zones": take over the default levels or adjust them later; locations get their zone here. */
export function ZonesStep(props: StepProps) {
  const { load, refresh, write, done } = useSetup(props.api, props.token, HAS_ZONES);
  return (
    <Frame
      title="Wie hell ist es?"
      intro="Die vier Standard-Lampen passen für den Anfang. Anpassen kannst du sie jederzeit unter „Standorte und Licht“."
    >
      <LoadFrame
        token={props.token}
        load={load}
        loadingText="Lichtzonen werden geladen …"
        refresh={refresh}
      >
        {(data: LightData) => (
          <>
            {data.zones.length === 0 ? (
              <DefaultsButton onTake={() => write("POST", "/light-zones/defaults", {})} />
            ) : (
              <ul className="list">
                {data.zones.map((z) => (
                  <li key={z.id} className="entry">
                    <h3>{z.name}</h3>
                  </li>
                ))}
              </ul>
            )}
            {data.zones.length > 0 && data.locations.length > 0 && (
              <ul className="list" aria-label="Standorte">
                {data.locations.map((l) => (
                  <LocationCard
                    key={l.id}
                    location={l}
                    zones={data.zones}
                    onUpdate={(e) => write("PUT", `/locations/${l.id}`, e)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </LoadFrame>
      <Leave done={done} onNext={props.onNext} />
    </Frame>
  );
}

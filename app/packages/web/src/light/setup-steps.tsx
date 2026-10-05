import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LoadFrame, SIGN_IN as KERNEL_SIGN_IN } from "../kernel";
import { createWrite, loadLight, type ApiError, type LightData } from "./light-api";
import { LocationCard, LocationForm, type LocationInput } from "./locations-view";
import { ErrorMessage } from "./message";
import { Fresh, useFresh } from "./fresh";
import { SetupStepSkeleton } from "./light-page.skeleton";
import { ENTRY, ZoneCard, ZoneForm } from "./zones-view";
import { kindText } from "./text";

const SIGN_IN: ApiError = { code: KERNEL_SIGN_IN.code, text: KERNEL_SIGN_IN.text };

type Token = () => Promise<string | undefined>;
interface StepProps {
  api: string;
  token: Token;
  /** Leaves the step, with or without data: every step can be skipped (US-ACC-03). */
  onNext: () => void;
}

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
  const write = async (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => {
    const t = await token();
    if (!t) return SIGN_IN;
    const r = await createWrite(api, t)(method, path, body);
    if (r.ok) setRefresh((n) => n + 1);
    return r.ok ? null : r.error;
  };
  return { load, refresh, write, done };
}

const LIST = "m-0 flex min-w-0 list-none flex-col gap-3 p-0";
const HAS_LOCATIONS = (d: LightData) => d.locations.length > 0;
const HAS_ZONES = (d: LightData) => d.zones.length > 0;

function Frame(props: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h2 tabIndex={-1} className="text-xl font-semibold">
        {props.title}
      </h2>
      <p className="text-sm text-muted-foreground">{props.intro}</p>
      {props.children}
    </section>
  );
}

function Leave(props: { done: boolean; onNext: () => void }) {
  return (
    <div className="flex flex-col md:flex-row">
      <Button type="button" variant={props.done ? "default" : "secondary"} onClick={props.onNext}>
        {props.done ? "Weiter" : "Überspringen"}
      </Button>
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
        loadingFallback={<SetupStepSkeleton label="Standorte werden geladen …" />}
        refresh={refresh}
      >
        {(data: LightData) => (
          <>
            {data.locations.length > 0 && (
              <ul className={LIST}>
                {data.locations.map((l) => (
                  <li key={l.id} className={ENTRY}>
                    <h3 className="text-lg font-semibold">{l.name}</h3>
                    <p className="text-sm text-muted-foreground">{kindText(l.kind)}</p>
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
      <div className="flex flex-col md:flex-row">
        <Button type="button" onClick={() => void props.onTake().then(setError)}>
          Standard-Lampen übernehmen
        </Button>
      </div>
    </>
  );
}

/** Onboarding, step "zones": take over the default levels or adjust them later; locations get their zone here. */
export function ZonesStep(props: StepProps) {
  const { load, refresh, write, done } = useSetup(props.api, props.token, HAS_ZONES);
  const fresh = useFresh();
  return (
    <Frame
      title="Wie hell ist es?"
      intro="Übernimm die vier Standard-Lampen oder passe sie an und lege eigene Zonen an. Ändern kannst du alles später unter „Standorte und Licht“."
    >
      <LoadFrame
        token={props.token}
        load={load}
        loadingText="Lichtzonen werden geladen …"
        loadingFallback={<SetupStepSkeleton label="Lichtzonen werden geladen …" />}
        refresh={refresh}
      >
        {(data: LightData) => (
          <>
            {data.zones.length === 0 ? (
              <DefaultsButton onTake={() => write("POST", "/light-zones/defaults", {})} />
            ) : (
              <ul className={LIST} aria-label="Lichtzonen">
                {data.zones.map((z) => (
                  <ZoneCard
                    key={z.id}
                    zone={z}
                    onUpdate={(e) => write("PUT", `/light-zones/${z.id}`, e)}
                    onDelete={() => write("DELETE", `/light-zones/${z.id}`)}
                  />
                ))}
              </ul>
            )}
            <Fresh title="Neue Lichtzone" fresh={fresh}>
              <ZoneForm onSave={(e) => write("POST", "/light-zones", e)} />
            </Fresh>
            {data.zones.length > 0 && data.locations.length > 0 && (
              <ul className={LIST} aria-label="Standorte">
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

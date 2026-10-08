import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button/button";
import { LoadFrame, SIGN_IN as KERNEL_SIGN_IN, useInvalidate, useRequest } from "../../../kernel";
import {
  createWrite,
  loadLight,
  type ApiError,
  type LightData,
} from "../../shared/light-api/light-api";
import {
  LocationCard,
  LocationForm,
  type LocationInput,
} from "../../zones/locations-view/locations-view";
import { ErrorMessage } from "../../shared/ui/message/message";
import { Fresh, useFresh } from "../../shared/ui/fresh/fresh";
import { SetupStepSkeleton } from "../../light-page/light-page.skeleton";
import { ENTRY, ZoneCard, ZoneForm } from "../../zones/zones-view/zones-view";
import { kindText } from "../../shared/texts";

const SIGN_IN: ApiError = { code: KERNEL_SIGN_IN.code, text: KERNEL_SIGN_IN.text };

type Token = () => Promise<string | undefined>;
interface StepProps {
  api: string;
  token: Token;
  /** Leaves the step, with or without data: every step can be skipped (US-ACC-03). */
  onNext: () => void;
}

const LIGHT_KEY = ["light", "data"] as const;
/** A write changes everything the light module shows, so it reloads the whole branch. */
const LIGHT_ALL = ["light"] as const;

/** Loads the light data of the account and offers writes that reload it afterwards (never guess the new state). */
function useSetup(api: string, token: Token, isDone: (d: LightData) => boolean) {
  const invalidate = useInvalidate(LIGHT_ALL);
  const load = useCallback((t: string) => loadLight(api, t), [api]);
  // Same key as the frame below, so both share one request and one cached copy.
  const { value } = useRequest({ queryKey: LIGHT_KEY, token, load });
  const done = value !== undefined && isDone(value);
  const write = async (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => {
    const t = await token();
    if (!t) return SIGN_IN;
    const r = await createWrite(api, t)(method, path, body);
    if (r.ok) invalidate();
    return r.ok ? null : r.error;
  };
  return { load, write, done };
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
  const { load, write, done } = useSetup(props.api, props.token, HAS_LOCATIONS);
  return (
    <Frame
      title="Wo stehen deine Pflanzen?"
      intro="Lege Standorte an, zum Beispiel Fensterbank oder Balkon. Du kannst das auch später tun."
    >
      <LoadFrame
        queryKey={LIGHT_KEY}
        token={props.token}
        load={load}
        loadingText="Standorte werden geladen …"
        loadingFallback={<SetupStepSkeleton label="Standorte werden geladen …" />}
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
  const { load, write, done } = useSetup(props.api, props.token, HAS_ZONES);
  const fresh = useFresh();
  return (
    <Frame
      title="Wie hell ist es?"
      intro="Übernimm die vier Standard-Lampen oder passe sie an und lege eigene Zonen an. Ändern kannst du alles später in der Sammlung unter „Standorte verwalten“."
    >
      <LoadFrame
        queryKey={LIGHT_KEY}
        token={props.token}
        load={load}
        loadingText="Lichtzonen werden geladen …"
        loadingFallback={<SetupStepSkeleton label="Lichtzonen werden geladen …" />}
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

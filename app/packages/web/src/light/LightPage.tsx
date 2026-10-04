import "./light.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LightView, type LightActions } from "./light-view";
import { LightOverviewView } from "./light-overview-view";
import {
  createWrite,
  loadDerivation,
  loadLight,
  loadLightOverview,
  type DerivationRequest,
  type ApiError,
  type LightData,
  type LightOverview,
} from "./light-api";

type State =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "bereit"; data: LightData; overview: LightOverview };

type Token = () => Promise<string | undefined>;

const NOT_SIGNED_IN = { code: "access.not_signed_in", text: "Bitte melde dich neu an." };

async function derive(api: string, token: Token, a: DerivationRequest) {
  const t = await token();
  if (t) return loadDerivation(api, t, a);
  return { ok: false as const, error: NOT_SIGNED_IN };
}

function buildActions(
  api: string,
  token: Token,
  load: () => Promise<void>,
  setLastError: (f: ApiError | undefined) => void,
): LightActions {
  const write = async (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => {
    const t = await token();
    if (!t) return { code: "access.not_signed_in", text: "Bitte melde dich neu an." };
    const r = await createWrite(api, t)(method, path, body);
    if (!r.ok) return r.error;
    setLastError(undefined);
    await load();
    return null;
  };
  return {
    zoneCreate: (e) => write("POST", "/light-zones", e),
    zoneUpdate: (id, e) => write("PUT", `/light-zones/${id}`, e),
    zoneDelete: (id) => write("DELETE", `/light-zones/${id}`),
    defaults: async () => {
      const f = await write("POST", "/light-zones/defaults", {});
      setLastError(f ?? undefined);
      return f;
    },
    locationCreate: (e) => write("POST", "/locations", e),
    locationUpdate: (id, e) => write("PUT", `/locations/${id}`, e),
    zoneDerive: (a) => derive(api, token, a),
  };
}

/** Loads the data and connects the view to the API; after every write it reloads (never guesses). */
export function LightPage(props: { api: string; token: () => Promise<string | undefined> }) {
  const [z, setZ] = useState<State>({ kind: "loading" });
  const [lastError, setLastError] = useState<ApiError | undefined>();
  const { api, token } = props;

  const load = useCallback(async () => {
    const t = await token();
    if (!t)
      return setZ({
        kind: "error",
        error: { code: "access.not_signed_in", text: "Bitte melde dich neu an." },
      });
    const [r, o] = await Promise.all([loadLight(api, t), loadLightOverview(api, t)]);
    if (!r.ok) return setZ({ kind: "error", error: r.error });
    if (!o.ok) return setZ({ kind: "error", error: o.error });
    setZ({ kind: "bereit", data: r.value, overview: o.value });
  }, [api, token]);
  useEffect(() => void load(), [load]);

  const actions = useMemo(() => buildActions(api, token, load, setLastError), [api, token, load]);

  if (z.kind === "loading")
    return (
      <p role="status" aria-busy="true">
        Standorte und Lichtzonen werden geladen …
      </p>
    );
  if (z.kind === "error")
    return (
      <div>
        <p role="alert" className="warning">
          {z.error.text}
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => void load()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  return (
    <div className="light-page">
      <LightOverviewView data={z.overview} />
      <LightView data={z.data} actions={actions} {...(lastError ? { error: lastError } : {})} />
    </div>
  );
}

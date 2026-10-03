import "./light.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LightView, type LightActions } from "./light-view";
import {
  createWrite,
  loadDerivation,
  loadLight,
  type DerivationRequest,
  type ApiError,
  type LightData,
} from "./light-api";

type State =
  { kind: "loading" } | { kind: "error"; error: ApiError } | { kind: "bereit"; data: LightData };

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
    const r = await loadLight(api, t);
    setZ(r.ok ? { kind: "bereit", data: r.value } : { kind: "error", error: r.error });
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
  return <LightView data={z.data} actions={actions} {...(lastError ? { error: lastError } : {})} />;
}

import { EmptyState } from "@/components/shared/empty-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SIGN_IN as KERNEL_SIGN_IN } from "../kernel";
import { LightView, type LightActions } from "./light-view";
import { LightOverviewView } from "./light-overview-view";
import { LightPageSkeleton } from "./light-page.skeleton";
import { refusalText } from "./refusal";
import {
  createWrite,
  loadDerivation,
  loadLight,
  loadLightOverview,
  type DerivationRequest,
  type ApiError,
  type LightData,
  type LightOverview,
  type Response,
} from "./light-api";

type State =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "bereit"; data: LightData; overview: Response<LightOverview> };

/** The refusal of a missing sign-in, typed for this module. */
const SIGN_IN: ApiError = { code: KERNEL_SIGN_IN.code, text: KERNEL_SIGN_IN.text };

type Token = () => Promise<string | undefined>;

async function derive(api: string, token: Token, a: DerivationRequest) {
  const t = await token();
  if (t) return loadDerivation(api, t, a);
  return { ok: false as const, error: SIGN_IN };
}

function buildActions(
  api: string,
  token: Token,
  load: () => Promise<void>,
  setLastError: (f: ApiError | undefined) => void,
): LightActions {
  const write = async (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => {
    const t = await token();
    if (!t) return SIGN_IN;
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

function OverviewSection(props: {
  overview: Response<LightOverview>;
  onOpenCollection: () => void;
  onRetry: () => void;
}) {
  const o = props.overview;
  if (o.ok) return <LightOverviewView data={o.value} onOpenCollection={props.onOpenCollection} />;
  return (
    <section aria-labelledby="overview-error" className="flex min-w-0 flex-col gap-3">
      <h2 id="overview-error" className="text-xl font-semibold">
        Lichthunger
      </h2>
      <EmptyState
        variant="error"
        title="Lichthunger konnte nicht geladen werden"
        description={refusalText(o.error)}
        action={{ label: "Erneut versuchen", onClick: props.onRetry }}
      />
    </section>
  );
}

/** Loads the data and connects the view to the API; after every write it reloads (never guesses). */
export function LightPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpenCollection: () => void;
}) {
  const [z, setZ] = useState<State>({ kind: "loading" });
  const [lastError, setLastError] = useState<ApiError | undefined>();
  const { api, token } = props;

  const load = useCallback(async () => {
    const t = await token();
    if (!t) return setZ({ kind: "error", error: SIGN_IN });
    const [r, o] = await Promise.all([loadLight(api, t), loadLightOverview(api, t)]);
    if (!r.ok) return setZ({ kind: "error", error: r.error });
    // The overview is an addition: if only it fails, the zones and locations stay usable.
    setZ({ kind: "bereit", data: r.value, overview: o });
  }, [api, token]);
  useEffect(() => void load(), [load]);

  const actions = useMemo(() => buildActions(api, token, load, setLastError), [api, token, load]);

  const loading = "Standorte und Lichtzonen werden geladen …";
  if (z.kind === "loading") return <LightPageSkeleton label={loading} />;
  if (z.kind === "error")
    return (
      <EmptyState
        variant="error"
        title="Standorte und Lichtzonen konnten nicht geladen werden"
        description={refusalText(z.error)}
        action={{ label: "Erneut versuchen", onClick: () => void load() }}
      />
    );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <OverviewSection
        overview={z.overview}
        onOpenCollection={props.onOpenCollection}
        onRetry={() => void load()}
      />
      <LightView data={z.data} actions={actions} {...(lastError ? { error: lastError } : {})} />
    </div>
  );
}

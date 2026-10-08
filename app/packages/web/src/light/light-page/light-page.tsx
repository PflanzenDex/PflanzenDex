import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/shared/states/toast/toast-provider/toast-provider";
import { RequestState } from "@/components/shared/states/request-state/request-state";
import { SIGN_IN as KERNEL_SIGN_IN, useReload, useRequest } from "../../kernel";
import { LightView, type LightActions } from "../views/light-view/light-view";
import { LightOverviewView } from "../views/light-overview-view/light-overview-view";
import { RulesView } from "../views/rules-view";
import { LightPageSkeleton } from "./light-page.skeleton";
import { refusalText } from "../shared/texts";
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
} from "../shared/light-api/light-api";

type Loaded = { data: LightData; overview: Response<LightOverview> };
const LIGHT_KEY = ["light"] as const;

/** The refusal of a missing sign-in, typed for this module. */
const SIGN_IN: ApiError = { code: KERNEL_SIGN_IN.code, text: KERNEL_SIGN_IN.text };

type Token = () => Promise<string | undefined>;

async function derive(api: string, token: Token, a: DerivationRequest) {
  const t = await token();
  if (t) return loadDerivation(api, t, a);
  return { ok: false as const, error: SIGN_IN };
}

function buildActions(
  { api, token }: { api: string; token: Token },
  load: () => Promise<void>,
  setLastError: (f: ApiError | undefined) => void,
  saved: (message: string) => void,
): LightActions {
  const write = async (
    method: "POST" | "PUT" | "DELETE",
    path: string,
    message: string,
    body?: unknown,
  ) => {
    const t = await token();
    if (!t) return SIGN_IN;
    const r = await createWrite(api, t)(method, path, body);
    if (!r.ok) return r.error;
    setLastError(undefined);
    await load();
    saved(message);
    return null;
  };
  return {
    zoneCreate: (e) => write("POST", "/light-zones", "Lichtzone angelegt.", e),
    zoneUpdate: (id, e) => write("PUT", `/light-zones/${id}`, "Lichtzone gespeichert.", e),
    zoneDelete: (id) => write("DELETE", `/light-zones/${id}`, "Lichtzone gelöscht."),
    defaults: async () => {
      const f = await write("POST", "/light-zones/defaults", "Standard-Lampen übernommen.", {});
      setLastError(f ?? undefined);
      return f;
    },
    locationCreate: (e) => write("POST", "/locations", "Standort angelegt.", e),
    locationUpdate: (id, e) => write("PUT", `/locations/${id}`, "Standort gespeichert.", e),
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
  const [lastError, setLastError] = useState<ApiError | undefined>();
  const { api, token } = props;
  const toast = useToast();

  const loadAll = useCallback(
    async (t: string): Promise<Response<Loaded>> => {
      const [r, o] = await Promise.all([loadLight(api, t), loadLightOverview(api, t)]);
      if (!r.ok) return r;
      // The overview is an addition: if only it fails, the zones and locations stay usable.
      return { ok: true, value: { data: r.value, overview: o } };
    },
    [api],
  );
  const request = useRequest({ queryKey: [...LIGHT_KEY, "page"], token, load: loadAll });
  const reload = useReload(LIGHT_KEY);
  const load = useCallback(() => reload(), [reload]);

  const actions = useMemo(
    () => buildActions({ api, token }, load, setLastError, (message) => toast.show({ message })),
    [api, token, load, toast],
  );

  const loading = "Standorte und Lichtzonen werden geladen …";
  const z = request.value;
  return (
    <RequestState
      status={request.status}
      onRetry={request.retry}
      heading="Standorte und Lichtzonen"
      skeleton={<LightPageSkeleton label={loading} />}
      offline={request.offline}
      {...(request.error ? { errorText: errorTitle(request.error) } : {})}
    >
      {z && (
        <div className="flex min-w-0 flex-col gap-6">
          <OverviewSection
            overview={z.overview}
            onOpenCollection={props.onOpenCollection}
            onRetry={() => void load()}
          />
          <RulesView zones={z.data.zones} />
          <LightView data={z.data} actions={actions} {...(lastError ? { error: lastError } : {})} />
        </div>
      )}
    </RequestState>
  );
}

/** The failed load names what could not be loaded and why, in the German text of the code (P-10). */
const errorTitle = (e: { code: string; text: string }) =>
  `Standorte und Lichtzonen konnten nicht geladen werden. ${refusalText(e as ApiError)}`;

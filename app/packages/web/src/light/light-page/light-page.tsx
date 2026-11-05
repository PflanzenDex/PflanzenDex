import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import {
  SIGN_IN as KERNEL_SIGN_IN,
  useQueryClient,
  useReload,
  useRequest,
} from "../../shared/data";
import { LightView, type LightActions } from "../views/light-view/light-view";
import { LightPageSkeleton } from "./light-page.skeleton";
import { refusalText } from "../shared/texts";
import {
  createWrite,
  loadDerivation,
  loadHints,
  loadLightOverview,
  type DerivationRequest,
  type ApiError,
  type LightData,
  type LightOverview,
  type Response,
} from "../shared/light-api/light-api";
import { LIGHT_KEY, sharedLocations, sharedZones } from "../shared/light-api/light-shared";

type Loaded = { data: LightData; overview: Response<LightOverview> };

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
      const f = await write("POST", "/light-zones/defaults", "Standard-Zonen übernommen.", {});
      setLastError(f ?? undefined);
      return f;
    },
    locationCreate: (e) => write("POST", "/locations", "Standort angelegt.", e),
    locationUpdate: (id, e) => write("PUT", `/locations/${id}`, "Standort gespeichert.", e),
    zoneDerive: (a) => derive(api, token, a),
  };
}

/** Loads the data and connects the view to the API; after every write it reloads (never guesses). */
export function LightPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpenCollection: () => void;
  /** Inside the Sammlung the frame above names the page (`FullView`, issue 1031): no second h1 from here. */
  hosted?: boolean;
}) {
  const [lastError, setLastError] = useState<ApiError | undefined>();
  const { api, token } = props;
  const toast = useToast();

  const client = useQueryClient();
  const loadAll = useCallback(
    async (t: string): Promise<Response<Loaded>> => {
      // Zones and locations come from their shared copies (issue 1244); hints and overview are this page's own.
      const [z, s, h, o] = await Promise.all([
        sharedZones(client, api, t),
        sharedLocations(client, api, t),
        loadHints(api, t),
        loadLightOverview(api, t),
      ]);
      if (!z.ok) return z;
      if (!s.ok) return s;
      if (!h.ok) return h;
      // The overview is an addition: if only it fails, the zones and locations stay usable.
      const data = { zones: z.value, locations: s.value, hints: h.value };
      return { ok: true, value: { data, overview: o } };
    },
    [api, client],
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
      {...(props.hosted ? {} : { heading: "Standorte und Lichtzonen" })}
      skeleton={<LightPageSkeleton label={loading} />}
      offline={request.offline}
      {...(request.error ? { errorText: errorTitle(request.error) } : {})}
    >
      {z && (
        <LightView
          data={z.data}
          actions={actions}
          overview={z.overview}
          onOpenCollection={props.onOpenCollection}
          onRetry={() => void load()}
          {...(props.hosted ? { hosted: true } : {})}
          {...(lastError ? { error: lastError } : {})}
        />
      )}
    </RequestState>
  );
}

/** The failed load names what could not be loaded and why, in the German text of the code (P-10). */
const errorTitle = (e: { code: string; text: string }) =>
  `Standorte und Lichtzonen konnten nicht geladen werden. ${refusalText(e as ApiError)}`;

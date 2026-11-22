import { useCallback, useMemo, useState } from "react";
import { useSay } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import {
  createKey,
  entityKey,
  newRepeatKey,
  SIGN_IN as KERNEL_SIGN_IN,
  type KeyScope,
  useQueryClient,
  useRepeatKey,
  useReload,
  useRequest,
} from "../../shared/data";
import { LightView, type LightActions } from "../views/light-view/light-view";
import { LightPageSkeleton } from "./light-page.skeleton";
import { refusalText } from "@/shared/lib/error-text";
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

/** One write's options: its body and its repeat-guard key (US-QS-03). */
type WriteOptions = { body?: unknown; scope?: KeyScope };

function buildActions(
  { api, token, keys }: { api: string; token: Token; keys: ReturnType<typeof useRepeatKey> },
  load: () => Promise<void>,
  setLastError: (f: ApiError | undefined) => void,
  say: (message: string) => void,
): LightActions {
  const write = async (
    method: "POST" | "PUT" | "DELETE",
    path: string,
    message: string,
    { body, scope }: WriteOptions,
  ) => {
    const t = await token();
    if (!t) return SIGN_IN;
    // The key belongs to the write's target and operation (US-QS-03); the body is never part of it. A write without a scope
    // is a background write (the zone defaults): its own key, it frees no held key of the page.
    const send = (key: string) => createWrite(api, t, { key })(method, path, body);
    const r = scope ? await keys.run(send, scope) : await send(newRepeatKey());
    if (!r.ok) return r.error;
    setLastError(undefined);
    await load();
    say(message);
    return null;
  };
  return {
    zoneCreate: (e) =>
      write("POST", "/light-zones", "Lichtzone angelegt.", {
        body: e,
        // A create: the operation only, the zone's fields are the body (US-QS-03).
        scope: createKey("zone", "create"),
      }),
    zoneUpdate: (id, e) =>
      write("PUT", `/light-zones/${id}`, "Lichtzone gesichert.", {
        body: e,
        // Set-state on the zone form (a whole form): the operation only (US-QS-03).
        scope: entityKey("zone", id, "update"),
      }),
    // The zone leaves the list: the list is the result and the live region says it (SG-FEED-01, SG-FEED-04).
    zoneDelete: (id) =>
      write("DELETE", `/light-zones/${id}`, "Lichtzone gelöscht.", {
        scope: entityKey("zone", id, "delete"),
      }),
    defaults: async () => {
      const f = await write("POST", "/light-zones/defaults", "Standard-Zonen übernommen.", {
        body: {},
      });
      setLastError(f ?? undefined);
      return f;
    },
    locationCreate: (e) =>
      write("POST", "/locations", "Standort angelegt.", {
        body: e,
        // A create: the operation only, the location's fields are the body (US-QS-03).
        scope: createKey("location", "create"),
      }),
    locationUpdate: (id, e) =>
      write("PUT", `/locations/${id}`, "Standort gesichert.", {
        body: e,
        // Set-state on the location form (a whole form): the operation only (US-QS-03).
        scope: entityKey("location", id, "update"),
      }),
    zoneDerive: (a) => derive(api, token, a),
  };
}

/** Loads the data and connects the view to the API; after every write it reloads (never guesses). */
export function LightPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** Inside the Sammlung the frame above names the page (`FullView`, issue 1031): no second h1 from here. */
  hosted?: boolean;
}) {
  const [lastError, setLastError] = useState<ApiError | undefined>();
  const { api, token } = props;
  const say = useSay();

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

  const keys = useRepeatKey();
  const actions = useMemo(
    () => buildActions({ api, token, keys }, load, setLastError, say),
    [api, token, load, say, keys],
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

// US-QS-27 · The installed app takes a new version on its next start (issue 1688). The worker's logic as plain functions: the
// list of the build's files, the names of the stored copies, the routing of one request and the wiring of its three events.
// The entry `sw.ts` calls `installWorker` with the real scope and caches; the tests call it with fakes, so no browser runs.
// Nothing here reads a global, so the module is safe to import from the build and from the tests.

/** Name prefix of the stored copies of one build's files. The worker deletes every copy with it that is not its own. */
export const CACHE_PREFIX = "pflanzendex-assets-";

/** The folder of the hashed files of a build, as a path of the origin. The worker answers only requests under it. */
export const ASSET_PATH = "/assets/";

/**
 * The placeholder of the build's manifest in the worker script. The Vite plugin in vite.config.ts (`SERVICE_WORKER_TOKEN`,
 * the same value, compared by a test) replaces it with the JSON of the manifest inside the string literal, so the worker
 * names its files without a request.
 */
export const MANIFEST_TOKEN = "__PDX_SW_MANIFEST__";

/** The files of one build: the version names the stored copy, the paths are the hashed files under `ASSET_PATH`. */
export type WorkerManifest = { version: string; assets: readonly string[] };

const isManifest = (value: unknown): value is WorkerManifest => {
  if (typeof value !== "object" || value === null) return false;
  const { version, assets } = value as { version?: unknown; assets?: unknown };
  return (
    typeof version === "string" &&
    version !== "" &&
    Array.isArray(assets) &&
    assets.every((asset) => typeof asset === "string" && asset.startsWith(ASSET_PATH))
  );
};

/** The manifest from its JSON text. A malformed text throws, so a broken build fails at its first start, not silently. */
export function parseManifest(text: string): WorkerManifest {
  const value: unknown = JSON.parse(text);
  if (!isManifest(value)) throw new Error("service worker: the manifest is malformed");
  return value;
}

/** The name of the stored copy of one version. */
export const cacheNameOf = (version: string): string => `${CACHE_PREFIX}${version}`;

/** The stored copies of older versions: every copy of the app that is not the current one. Other names are not touched. */
export function staleCacheNames(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}

/**
 * Whether the worker answers a request from its stored copy: a GET of a file under `ASSET_PATH` on its own origin.
 * Everything else (navigations and `index.html`, the API, `/sw.js`, other origins, any method but GET) goes to the network
 * untouched, because the worker adds no offline mode (US-QS-27, #1687).
 */
export function answersFromStore(
  request: Pick<Request, "method" | "url">,
  origin: string,
): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.origin === origin && url.pathname.startsWith(ASSET_PATH);
}

/** The part of the cache storage the worker uses. */
export type Store = Pick<CacheStorage, "open" | "keys" | "delete">;

/** The events the worker listens to, as far as it uses them. */
export type WorkerEvents = {
  install: { waitUntil(task: Promise<unknown>): void };
  activate: { waitUntil(task: Promise<unknown>): void };
  fetch: { request: Request; respondWith(response: Promise<Response>): void };
};

/** The worker's global scope as far as the worker uses it. */
export type WorkerScope = {
  location: { origin: string };
  addEventListener<K extends keyof WorkerEvents>(
    type: K,
    listener: (event: WorkerEvents[K]) => void,
  ): void;
};

/**
 * Listens to the three events of the worker (US-QS-27). The install stores every file of the build, all or nothing: one file
 * that cannot be stored fails the install, so the running version keeps running and the install is tried again at the next
 * start (P-10). The worker never calls `skipWaiting` and never claims open windows: a new version waits until no window runs
 * the old one, so it takes over on the next start. The activation deletes the stored copies of older versions. A request
 * under `ASSET_PATH` is answered from the copy of this version, and from the network when the copy lacks the file.
 */
export function installWorker(scope: WorkerScope, manifest: WorkerManifest, store: Store): void {
  const current = cacheNameOf(manifest.version);
  scope.addEventListener("install", (event) => {
    event.waitUntil(store.open(current).then((cache) => cache.addAll([...manifest.assets])));
  });
  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      store
        .keys()
        .then((names) =>
          Promise.all(staleCacheNames(names, current).map((name) => store.delete(name))),
        )
        .then(() => undefined),
    );
  });
  scope.addEventListener("fetch", (event) => {
    if (!answersFromStore(event.request, scope.location.origin)) return;
    event.respondWith(
      store
        .open(current)
        .then((cache) => cache.match(event.request))
        .then((stored) => stored ?? fetch(event.request)),
    );
  });
}

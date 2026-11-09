import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_PATH,
  CACHE_PREFIX,
  answersFromStore,
  cacheNameOf,
  installWorker,
  MANIFEST_TOKEN,
  parseManifest,
  staleCacheNames,
  type Store,
  type WorkerEvents,
  type WorkerScope,
} from "./worker-logic";

const ORIGIN = "https://app.example";
const MANIFEST = { version: "v1abc", assets: ["/assets/app-1.js", "/assets/app.css"] };
const CURRENT = cacheNameOf(MANIFEST.version);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Listener = (event: never) => void;

/** A fake worker scope: the listeners it was given, and spies for what the worker must never call (US-QS-27). */
function fakeScope() {
  const listeners = new Map<string, Listener>();
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting,
    clients: { claim },
  };
  const fire = (type: keyof WorkerEvents, event: object) =>
    (listeners.get(type) as ((event: object) => void) | undefined)?.(event);
  return { scope: scope as unknown as WorkerScope, fire, skipWaiting, claim };
}

/** Event of install or activate: records the task it was asked to wait for. */
function waitingEvent() {
  const tasks: Promise<unknown>[] = [];
  return { event: { waitUntil: (task: Promise<unknown>) => tasks.push(task) }, tasks };
}

/** Event of fetch: records what the worker answers with. */
function fetchEvent(url: string) {
  const answers: Promise<Response>[] = [];
  const request = new Request(url);
  return {
    event: { request, respondWith: (answer: Promise<Response>) => answers.push(answer) },
    answers,
  };
}

/** The part of the cache storage the worker uses, with the stored names and the copies of the versions. */
function fakeStore(initial: string[] = [], failInstall = false) {
  const present = new Set(initial);
  const copies = new Map<
    string,
    { addAll: ReturnType<typeof vi.fn>; match: ReturnType<typeof vi.fn> }
  >();
  const store = {
    open: vi.fn(async (name: string) => {
      present.add(name);
      let copy = copies.get(name);
      if (!copy) {
        copy = {
          addAll: vi.fn(async () => {
            if (failInstall) throw new Error("a file could not be stored");
          }),
          match: vi.fn(async () => undefined),
        };
        copies.set(name, copy);
      }
      return copy as unknown as Cache;
    }),
    keys: vi.fn(async () => [...present]),
    delete: vi.fn(async (name: string) => present.delete(name)),
  };
  return { store: store as unknown as Store, present, copies };
}

describe("US-QS-27 the manifest of the build", () => {
  it("US-QS-27 reads the list of the build's files as it was written", () => {
    expect(parseManifest(JSON.stringify(MANIFEST))).toEqual(MANIFEST);
  });

  it("US-QS-27 refuses a malformed manifest, so a broken build fails at its first start", () => {
    expect(() => parseManifest("nicht json")).toThrow();
    expect(() => parseManifest(JSON.stringify({ version: "", assets: [] }))).toThrow(/malformed/);
    expect(() => parseManifest(JSON.stringify({ version: "v1", assets: ["/index.html"] }))).toThrow(
      /malformed/,
    );
  });
});

describe("US-QS-27 the stored copies of the versions", () => {
  it("US-QS-27 names the copy of a version with the app's prefix and the version", () => {
    expect(CURRENT).toBe(`${CACHE_PREFIX}v1abc`);
    expect(ASSET_PATH).toBe("/assets/");
  });

  it("US-QS-27 deletes only the older copies of the app and keeps the current one and other caches", () => {
    const names = [`${CACHE_PREFIX}old`, CURRENT, "some-other-cache"];
    expect(staleCacheNames(names, CURRENT)).toEqual([`${CACHE_PREFIX}old`]);
  });
});

describe("US-QS-27 which requests the worker answers from its copy", () => {
  it("US-QS-27 answers a GET of a file under /assets/ of its own origin", () => {
    expect(answersFromStore(new Request(`${ORIGIN}/assets/app-1.js`), ORIGIN)).toBe(true);
  });

  it("US-QS-27 leaves navigations, index.html, the API, /sw.js, other origins and other methods to the network", () => {
    const untouched = [
      `${ORIGIN}/`,
      `${ORIGIN}/index.html`,
      `${ORIGIN}/account/news`,
      `${ORIGIN}/api/specimens`,
      `${ORIGIN}/sw.js`,
      `${ORIGIN}/assetsfoo`,
      "https://other.example/assets/app-1.js",
    ];
    for (const url of untouched) expect(answersFromStore(new Request(url), ORIGIN)).toBe(false);
    expect(
      answersFromStore(new Request(`${ORIGIN}/assets/app-1.js`, { method: "POST" }), ORIGIN),
    ).toBe(false);
  });
});

describe("US-QS-27 the worker's events", () => {
  it("US-QS-27 the install stores every file of the build in the copy of its version and claims nothing", async () => {
    const { scope, fire, skipWaiting, claim } = fakeScope();
    const { store, copies } = fakeStore();
    installWorker(scope, MANIFEST, store);
    const { event, tasks } = waitingEvent();
    fire("install", event);
    await Promise.all(tasks);
    expect(copies.get(CURRENT)?.addAll).toHaveBeenCalledWith(MANIFEST.assets);
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("US-QS-27 a failed install fails as a whole: the install is not finished, so the running version keeps running", async () => {
    const { scope, fire, skipWaiting } = fakeScope();
    const { store } = fakeStore([], true);
    installWorker(scope, MANIFEST, store);
    const { event, tasks } = waitingEvent();
    fire("install", event);
    await expect(Promise.all(tasks)).rejects.toThrow(/could not be stored/);
    expect(skipWaiting).not.toHaveBeenCalled();
  });

  it("US-QS-27 the activation deletes the copies of older versions and claims no open window", async () => {
    const { scope, fire, skipWaiting, claim } = fakeScope();
    const { store, present } = fakeStore([`${CACHE_PREFIX}old`, CURRENT, "some-other-cache"]);
    installWorker(scope, MANIFEST, store);
    const { event, tasks } = waitingEvent();
    fire("activate", event);
    await Promise.all(tasks);
    expect([...present].sort()).toEqual([CURRENT, "some-other-cache"].sort());
    expect(skipWaiting).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("US-QS-27 an asset is answered from the copy of this version when the copy has it", async () => {
    const { scope, fire } = fakeScope();
    const { store, copies } = fakeStore();
    installWorker(scope, MANIFEST, store);
    const stored = new Response("gespeichert");
    copies.set(CURRENT, {
      addAll: vi.fn(),
      match: vi.fn(async () => stored),
    });
    const { event, answers } = fetchEvent(`${ORIGIN}/assets/app-1.js`);
    fire("fetch", event);
    expect(answers).toHaveLength(1);
    expect(await (await answers[0])?.text()).toBe("gespeichert");
  });

  it("US-QS-27 an asset that the copy lacks is fetched from the network", async () => {
    const fetchSpy = vi.fn(async () => new Response("aus dem Netz"));
    vi.stubGlobal("fetch", fetchSpy);
    const { scope, fire } = fakeScope();
    const { store } = fakeStore();
    installWorker(scope, MANIFEST, store);
    const { event, answers } = fetchEvent(`${ORIGIN}/assets/app-2.js`);
    fire("fetch", event);
    expect(await (await answers[0])?.text()).toBe("aus dem Netz");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("US-QS-27 navigations and API calls are not answered by the worker at all", () => {
    const { scope, fire } = fakeScope();
    const { store } = fakeStore();
    installWorker(scope, MANIFEST, store);
    for (const url of [`${ORIGIN}/account/news`, `${ORIGIN}/api/specimens`, `${ORIGIN}/sw.js`]) {
      const { event, answers } = fetchEvent(url);
      fire("fetch", event);
      expect(answers).toHaveLength(0);
    }
  });
});

describe("US-QS-27 the manifest token of the worker script", () => {
  it("US-QS-27 the placeholder is the token the build replaces", () => {
    expect(MANIFEST_TOKEN).toBe("__PDX_SW_MANIFEST__");
  });
});

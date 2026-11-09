// US-QS-27 · The build of the app's worker (issue 1688): the plugin in vite.config.ts writes the list of the build's hashed
// files into `sw.js`. Tested as plain functions: no build runs here (the build itself is checked by `npm run build`).
import { describe, expect, it } from "vitest";
import { MANIFEST_TOKEN, parseManifest } from "./worker-logic";
import {
  injectServiceWorkerManifest,
  SERVICE_WORKER_FILE,
  SERVICE_WORKER_TOKEN,
  serviceWorkerBuild,
  serviceWorkerManifest,
} from "../../../../../vite.config";

/** The manifest the worker reads back: the JSON inside its string literal `manifest = "…"`. */
function manifestIn(code: string) {
  const literal = /manifest = "((?:[^"\\]|\\.)*)"/.exec(code)?.[1];
  if (literal === undefined) throw new Error("the worker has no manifest literal");
  return parseManifest(JSON.parse(`"${literal}"`));
}

/** The worker script as the build hands it over: the placeholder in a string literal. */
const WORKER = `const manifest = "${SERVICE_WORKER_TOKEN}";`;

type Hook = (this: unknown, ...args: unknown[]) => void;

describe("US-QS-27 the list of the build's files", () => {
  it("US-QS-27 holds every hashed file of the build as a path of the origin, and no page or source map", () => {
    const manifest = serviceWorkerManifest([
      "index.html",
      "manifest.webmanifest",
      "sw.js",
      "icons/icon-192.png",
      "assets/app-1.js",
      "assets/app.css",
      "assets/app-1.js.map",
    ]);
    expect(manifest.assets).toEqual(["/assets/app-1.js", "/assets/app.css"]);
  });

  it("US-QS-27 names the version by a hash of the list: the same files give the same version, new files a new one", () => {
    const first = serviceWorkerManifest(["assets/app-1.js", "assets/app.css"]);
    const same = serviceWorkerManifest(["assets/app.css", "assets/app-1.js"]);
    const changed = serviceWorkerManifest(["assets/app-2.js", "assets/app.css"]);
    expect(first.version).toMatch(/^[0-9a-f]{16}$/);
    expect(same.version).toBe(first.version);
    expect(changed.version).not.toBe(first.version);
  });

  it("US-QS-27 a build without any hashed file fails instead of shipping a worker that stores nothing", () => {
    expect(() => serviceWorkerManifest(["index.html", "sw.js"])).toThrow(/no hashed files/);
  });
});

describe("US-QS-27 the list in the worker script", () => {
  it("US-QS-27 the placeholder of the build is the token the worker script reads", () => {
    expect(SERVICE_WORKER_TOKEN).toBe(MANIFEST_TOKEN);
  });

  it("US-QS-27 the worker script carries the list, and the worker reads it back unchanged", () => {
    const manifest = serviceWorkerManifest(["assets/app-1.js", "assets/app.css"]);
    const code = injectServiceWorkerManifest(WORKER, manifest);
    expect(code).not.toContain(SERVICE_WORKER_TOKEN);
    expect(manifestIn(code)).toEqual(manifest);
  });

  it("US-QS-27 quotes and backslashes in a file name are escaped, so the list still reads back", () => {
    const manifest = { version: "abc", assets: ['/assets/odd"name\\.js'] };
    expect(manifestIn(injectServiceWorkerManifest(WORKER, manifest))).toEqual(manifest);
  });

  it("US-QS-27 a worker script without the placeholder fails the build", () => {
    expect(() =>
      injectServiceWorkerManifest("const manifest = 1;", {
        version: "v",
        assets: ["/assets/a.js"],
      }),
    ).toThrow(/no manifest placeholder/);
  });
});

describe("US-QS-27 the Vite plugin of the worker", () => {
  it("US-QS-27 the plugin runs at build only and emits the worker script as sw.js at the root", () => {
    const plugin = serviceWorkerBuild();
    expect(plugin.apply).toBe("build");
    const emitted: unknown[] = [];
    const context = {
      emitFile: (file: unknown) => {
        emitted.push(file);
        return "ref";
      },
    };
    (plugin.buildStart as Hook).call(context);
    expect(emitted).toEqual([
      {
        type: "chunk",
        id: expect.stringMatching(/service-worker[\\/]sw\.ts$/),
        fileName: SERVICE_WORKER_FILE,
      },
    ]);
  });

  it("US-QS-27 the plugin writes the list of the build's files into the worker script", () => {
    const plugin = serviceWorkerBuild();
    const bundle: Record<string, { type: string; code?: string }> = {
      "index.html": { type: "asset" },
      "assets/app-1.js": { type: "chunk", code: "" },
      "assets/app.css": { type: "asset" },
      "assets/app-1.js.map": { type: "asset" },
      [SERVICE_WORKER_FILE]: { type: "chunk", code: WORKER },
    };
    (plugin.generateBundle as Hook).call({}, {}, bundle);
    const manifest = manifestIn(bundle[SERVICE_WORKER_FILE]?.code ?? "");
    expect(manifest.assets).toEqual(["/assets/app-1.js", "/assets/app.css"]);
  });

  it("US-QS-27 a build without the worker script fails instead of shipping no worker", () => {
    const plugin = serviceWorkerBuild();
    expect(() =>
      (plugin.generateBundle as Hook).call({}, {}, { "assets/app-1.js": { type: "chunk" } }),
    ).toThrow(/was not emitted/);
  });
});

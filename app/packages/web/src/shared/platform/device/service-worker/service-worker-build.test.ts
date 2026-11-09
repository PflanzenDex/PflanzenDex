// US-QS-27 · The build of the app's worker (issue 1688): the plugin in vite.config.ts writes the list of the build's hashed
// files into `sw.js`. The plugin's hooks are called as plain functions, and a real build of a small fixture checks the
// output on disk (the list names only files that exist, and `sw.js` is a classic script).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext, Script } from "node:vm";
import { build } from "vite";
import { afterEach, describe, expect, it } from "vitest";
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
/** A plugin hook, as a function (a hook may be given as a plain function or as `{ handler, order }`). */
const hookOf = (hook: unknown): Hook =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler) as Hook;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The output of a real build of a small app: a lazy stylesheet that is a chunk of its own (a pure CSS chunk). */
async function buildFixture(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "pdx-sw-build-"));
  dirs.push(root);
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>',
  );
  writeFileSync(join(root, "main.js"), 'import("./lazy.css");\nconsole.log("app");\n');
  writeFileSync(join(root, "lazy.css"), ".lazy { color: rebeccapurple; }\n");
  const outDir = join(root, "dist");
  await build({
    configFile: false,
    root,
    logLevel: "silent",
    plugins: [serviceWorkerBuild()],
    build: { outDir, emptyOutDir: true },
  });
  return outDir;
}

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
    hookOf(plugin.buildStart).call(context);
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
    const bundle: Record<
      string,
      { type: string; code?: string; imports?: string[]; exports?: string[] }
    > = {
      "index.html": { type: "asset" },
      "assets/app-1.js": { type: "chunk", code: "" },
      "assets/app.css": { type: "asset" },
      "assets/app-1.js.map": { type: "asset" },
      [SERVICE_WORKER_FILE]: { type: "chunk", code: WORKER, imports: [], exports: [] },
    };
    hookOf(plugin.generateBundle).call({}, {}, bundle);
    const manifest = manifestIn(bundle[SERVICE_WORKER_FILE]?.code ?? "");
    expect(manifest.assets).toEqual(["/assets/app-1.js", "/assets/app.css"]);
  });

  it("US-QS-27 a build without the worker script fails instead of shipping no worker", () => {
    const plugin = serviceWorkerBuild();
    expect(() =>
      hookOf(plugin.generateBundle).call({}, {}, { "assets/app-1.js": { type: "chunk" } }),
    ).toThrow(/was not emitted/);
  });

  it("US-QS-27 the list is taken after the other plugins have finished the bundle (order post)", () => {
    const plugin = serviceWorkerBuild();
    expect((plugin.generateBundle as { order?: string }).order).toBe("post");
  });

  it("US-QS-27 a worker that is no classic script fails the build: sw.js is registered as a classic script", () => {
    const plugin = serviceWorkerBuild();
    const bundleWith = (code: string, extra: Record<string, unknown> = {}) => ({
      "assets/app-1.js": { type: "chunk", code: "" },
      [SERVICE_WORKER_FILE]: { type: "chunk", code: code, imports: [], exports: [], ...extra },
    });
    const run = (bundle: object) => hookOf(plugin.generateBundle).call({}, {}, bundle);
    expect(() => run(bundleWith('import x from "./y.js";\n' + WORKER))).toThrow(/classic script/);
    expect(() => run(bundleWith("export const a = 1;\n" + WORKER))).toThrow(/classic script/);
    expect(() => run(bundleWith(WORKER, { imports: ["lazy.js"] }))).toThrow(/classic script/);
    expect(() => run(bundleWith(WORKER, { exports: ["a"] }))).toThrow(/classic script/);
    expect(() => run(bundleWith("const m = 1; console.log(import.meta.url);\n" + WORKER))).toThrow(
      /classic script/,
    );
    expect(() => run(bundleWith(WORKER))).not.toThrow();
  });

  it("US-QS-27 the build fails when a listed file is not on disk after the write", () => {
    const plugin = serviceWorkerBuild();
    const bundle = {
      "assets/app-1.js": { type: "chunk", code: "" },
      [SERVICE_WORKER_FILE]: { type: "chunk", code: WORKER, imports: [], exports: [] },
    };
    hookOf(plugin.generateBundle).call({}, {}, bundle);
    const dir = mkdtempSync(join(tmpdir(), "pdx-sw-write-"));
    dirs.push(dir);
    expect(() => hookOf(plugin.writeBundle).call({}, { dir }, bundle)).toThrow(
      /not in the output: \/assets\/app-1\.js/,
    );
  });
});

/**
 * Runs the built worker as the browser would, with fake worker globals, and returns what its install stores: the cache
 * name (with the version) and the list of files it asks the cache to add. The minified script has no fixed shape to read.
 */
async function installedBy(code: string): Promise<{ cache: string; assets: string[] }> {
  const listeners: Record<string, (event: { waitUntil(task: Promise<unknown>): void }) => void> =
    {};
  let cache = "";
  let assets: string[] = [];
  const store = {
    open: async (name: string) => {
      cache = name;
      return {
        addAll: async (list: string[]) => {
          assets = list;
        },
        match: async () => undefined,
      };
    },
    keys: async () => [],
    delete: async () => true,
  };
  runInNewContext(code, {
    self: {
      location: { origin: "https://app.example" },
      addEventListener: (type: string, listener: (typeof listeners)[string]) => {
        listeners[type] = listener;
      },
    },
    caches: store,
  });
  const tasks: Promise<unknown>[] = [];
  listeners["install"]?.({ waitUntil: (task) => tasks.push(task) });
  await Promise.all(tasks);
  return { cache, assets };
}

describe("US-QS-27 the real build of a small app", () => {
  it("US-QS-27 every file the worker lists exists in the output, also when a lazy stylesheet has no script of its own", async () => {
    const outDir = await buildFixture();
    const code = readFileSync(join(outDir, SERVICE_WORKER_FILE), "utf8");
    const { cache, assets } = await installedBy(code);
    expect(cache).toMatch(/^pflanzendex-assets-[0-9a-f]{16}$/);
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets)
      expect(existsSync(join(outDir, asset)), `listed file ${asset} exists`).toBe(true);
    expect(assets.some((asset) => asset.endsWith(".css"))).toBe(true);
  });

  it("US-QS-27 the output worker is a classic script: it compiles as a script and has no import or export", async () => {
    const outDir = await buildFixture();
    const code = readFileSync(join(outDir, SERVICE_WORKER_FILE), "utf8");
    expect(() => new Script(code)).not.toThrow();
    expect(code).not.toMatch(/^\s*(import|export)\b/m);
  });
});

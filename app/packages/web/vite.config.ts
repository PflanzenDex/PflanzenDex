import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { coverageFor } from "../../tools/check/quality/coverage/coverage-config.mjs";

// The sign-in library (oidc-client-ts) decides the first screen of every visitor, so its chunk is preloaded with the page
// and starts with the entry, not one download after it (issue 1728, the Lighthouse start page LCP).
function preloadSignInLibrary(): Plugin {
  return {
    name: "pflanzendex-preload-sign-in-library",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const chunk = Object.values(ctx.bundle ?? {}).find(
        (file) =>
          file.type === "chunk" &&
          Object.keys(file.modules).some((id) => id.includes("/node_modules/oidc-client-ts/")),
      );
      if (!chunk) return [];
      return [
        {
          tag: "link",
          attrs: { rel: "modulepreload", crossorigin: true, href: `/${chunk.fileName}` },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// The app's worker (US-QS-27, issue 1688): the worker script is built as `sw.js` at the root, and the plugin writes into it
// the list of the build's hashed `/assets/` files and a version that is a hash of that list. A new build has new file names,
// so a new list and a new version. The worker's logic is in shared/platform/device/service-worker/worker-logic.ts, which
// reads the placeholder under the same name (a test compares them). The helpers live here, not in an imported module,
// because the native config loader of Vite takes only explicit file extensions.
export const SERVICE_WORKER_FILE = "sw.js";
/** The placeholder of the manifest in the worker script; the plugin replaces it inside the string literal. */
export const SERVICE_WORKER_TOKEN = "__PDX_SW_MANIFEST__";
const SERVICE_WORKER_ENTRY = fileURLToPath(
  new URL("./src/shared/platform/device/service-worker/sw.ts", import.meta.url),
);

/** The list of the build's files the worker stores: every hashed file under `assets/`, as paths of the origin. */
export function serviceWorkerManifest(fileNames: readonly string[]): {
  version: string;
  assets: string[];
} {
  const assets = fileNames
    .filter((name) => name.startsWith("assets/") && !name.endsWith(".map"))
    .map((name) => `/${name}`)
    .sort();
  if (assets.length === 0) throw new Error("service worker build: the build has no hashed files");
  const version = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 16);
  return { version, assets };
}

/** The worker script with the manifest in place of its placeholder, escaped for the double-quoted string literal. */
export function injectServiceWorkerManifest(
  code: string,
  manifest: { version: string; assets: readonly string[] },
): string {
  if (!code.includes(SERVICE_WORKER_TOKEN))
    throw new Error(`service worker build: ${SERVICE_WORKER_FILE} has no manifest placeholder`);
  const literal = JSON.stringify(JSON.stringify(manifest)).slice(1, -1);
  return code.split(SERVICE_WORKER_TOKEN).join(literal);
}

/**
 * The worker is registered as a classic script (US-QS-27): a script that imports or exports, or that uses module syntax,
 * would not run in the browser, so the build fails instead. `new vm.Script` only compiles the code; it runs nothing.
 */
function assertClassicScript(
  code: string,
  chunk: { imports: readonly string[]; exports: readonly string[] },
): void {
  if (chunk.imports.length > 0 || chunk.exports.length > 0)
    throw new Error(
      `service worker build: ${SERVICE_WORKER_FILE} is not a classic script (it imports or exports)`,
    );
  try {
    new Script(code, { filename: SERVICE_WORKER_FILE });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `service worker build: ${SERVICE_WORKER_FILE} is not a classic script (${reason})`,
      {
        cause,
      },
    );
  }
}

/** The name of the worker plugin; the Storybook catalog drops it (`.storybook/main.ts`), since it has no worker. */
export const SERVICE_WORKER_PLUGIN = "pflanzendex-service-worker";

/**
 * The worker as a plugin: it emits `sw.js` from the worker entry and fills in the list of the build's files (US-QS-27).
 * The list is taken after every other plugin has finished the bundle (`order: "post"`): a pure CSS chunk loses its empty
 * script in a later step of Vite, so a list taken earlier names files that are never written. After the write, every
 * listed file must exist on disk; otherwise the build fails.
 */
export function serviceWorkerBuild(): Plugin {
  let listed: readonly string[] = [];
  return {
    name: SERVICE_WORKER_PLUGIN,
    apply: "build",
    enforce: "post",
    buildStart() {
      this.emitFile({ type: "chunk", id: SERVICE_WORKER_ENTRY, fileName: SERVICE_WORKER_FILE });
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const worker = bundle[SERVICE_WORKER_FILE];
        if (worker?.type !== "chunk")
          throw new Error(`service worker build: ${SERVICE_WORKER_FILE} was not emitted`);
        const manifest = serviceWorkerManifest(Object.keys(bundle));
        listed = manifest.assets;
        worker.code = injectServiceWorkerManifest(worker.code, manifest);
        assertClassicScript(worker.code, worker);
      },
    },
    writeBundle(options) {
      const dir = resolve(options.dir ?? "dist");
      // The folder is the output of this build and the names are the list the build just wrote, never user input.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- output folder of this build and its own list
      const missing = listed.filter((asset) => !existsSync(join(dir, asset)));
      if (missing.length > 0)
        throw new Error(
          `service worker build: listed files are not in the output: ${missing.join(", ")}`,
        );
    },
  };
}

// The React Compiler trial (issue 2300, US-QS-14): evaluation only, never merged. panicThreshold "none": a function the
// compiler cannot handle is skipped, never a failed build. PDX_COMPILER_LOG names a file for the compile events (one JSON
// line each); only the measurement sets it.
type CompileEvent = {
  kind: string;
  fnLoc?: { start: { line: number } } | null;
  fnName?: string | null;
  memoSlots?: number;
  reason?: string;
  data?: string;
  detail?: unknown;
};
const compilerLog = process.env.PDX_COMPILER_LOG;
const logEvent = (file: string | null, e: CompileEvent) =>
  // The log file is named by the measurement, never by user input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the measurement's own log file
  appendFileSync(
    compilerLog as string,
    `${JSON.stringify({ file, kind: e.kind, fnName: e.fnName ?? null, line: e.fnLoc?.start.line ?? null, memoSlots: e.memoSlots ?? null, reason: e.reason ?? e.data ?? null })}\n`,
  );
const reactCompiler = reactCompilerPreset({
  panicThreshold: "none",
  logger: compilerLog ? { logEvent } : null,
});

export default defineConfig({
  // The worker `sw.js` (US-QS-27) lists the build's hashed files; the plugin writes that list into it.
  plugins: [
    react(),
    babel({ presets: [reactCompiler] }),
    tailwindcss(),
    preloadSignInLibrary(),
    serviceWorkerBuild(),
  ],
  // Static files served from the root (manifest, favicon, icons). Generated by `npm run icons` (US-QS-07), kept out of
  // the root of this package, which the layout gate limits to five units.
  publicDir: "src/styles/pwa/public",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // The modules the entry imports statically travel as one chunk (QG-U6, issue 2226): left to the automatic split,
          // each module that a lazy page shares became a tiny chunk of its own, and every chunk is compressed on its own,
          // so the start paid for about 3 kB of headers and cross-chunk imports. Only `$initial` modules are captured, so
          // no lazy page joins the start; the worker is its own entry and must stay a classic script without imports.
          groups: [
            { name: "start", tags: ["$initial"], test: (id) => !id.includes("service-worker") },
          ],
        },
      },
    },
  },
  test: {
    setupFiles: ["./src/shared/testing/test-setup/test-setup.tsx"],
    coverage: coverageFor("web"),
  },
});

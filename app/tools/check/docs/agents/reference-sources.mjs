// Collects the building blocks the reference docs must name (US-QG-10, FR-QG-25): API routes, core operations and the
// shared UI components. Used by check-reference.mjs; pure parsing is exported for the tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(here, "../../../..");

/** `METHOD /path` with every path parameter reduced to `:`, so `:id` and `:speciesId` name the same route. */
export const routeKey = (method, routePath) =>
  `${method.toUpperCase()} ${routePath.replace(/:[^/]+/g, ":")}`;

/** The routes of the API, from the built Hono app (api-routes.mjs runs under tsx). Throws when the app cannot load. */
export function apiRoutes() {
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(here, "api-routes.mjs")],
    {
      cwd: APP,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  return JSON.parse(out);
}

/** Operation names `<domain>.<verb>` in one source text: the first `name: "…"` after each `defineOperation(`. */
export function operationNames(source) {
  return source
    .split("defineOperation")
    .slice(1)
    .flatMap((call) => {
      if (!/^\s*[<(]/.test(call)) return []; // an import or re-export, not a call
      const m = call.match(/\bname:\s*"([^"]+)"/);
      return m ? [m[1]] : [];
    });
}

function files(dir, keep) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).flatMap((e) => {
    const full = path.join(e.parentPath, e.name);
    return e.isFile() && keep(full) ? [full] : [];
  });
}

const isSource = (f) => /\.tsx?$/.test(f) && !/\.(test|stories|fixtures)\.tsx?$/.test(f);

/** Every operation defined in `core`, without the test helpers. */
export function coreOperations(src = path.join(APP, "packages/core/src")) {
  return files(src, (f) => isSource(f) && !f.endsWith("test-helpers.ts")).flatMap((f) =>
    operationNames(fs.readFileSync(f, "utf8")),
  );
}

/** PascalCase name of a component file `<name>/<name>.tsx`, or undefined for a file that is no component. */
export function componentName(file) {
  const stem = path.basename(file, ".tsx");
  if (!file.endsWith(".tsx") || path.basename(path.dirname(file)) !== stem) return undefined;
  return stem.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
}

/** The components of `components/ui` and `components/shared` (LY-4 layout: one folder per component). */
export function sharedComponents(web = path.join(APP, "packages/web/src/components")) {
  return ["ui", "shared"].flatMap((group) =>
    files(path.join(web, group), isSource).map(componentName).filter(Boolean),
  );
}

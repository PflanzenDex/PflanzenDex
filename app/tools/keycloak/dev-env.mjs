// The shared local Keycloak and its admin password (US-DEV-08, issue 1187). Every checkout uses the one container
// `pflanzendex-keycloak`, so only the main checkout holds `app/config/dev/.env`; a worktree reads that file and never
// makes its own (a second password would make `docker compose` recreate the container and drop its realm changes).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Root of the main checkout seen from `cwd`, also inside a worktree (git common dir may be relative or absolute). */
export function mainCheckout(cwd) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  }).trim();
  return dirname(resolve(cwd, common));
}

/** True when `cwd` lies in the main checkout, false in a linked worktree. */
export function inMainCheckout(cwd) {
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();
  return resolve(top) === mainCheckout(cwd);
}

/** Directory of the dev compose file and `.env` of the main checkout. */
export function devConfigDir(cwd) {
  return join(mainCheckout(cwd), "app", "config", "dev");
}

export function envValue(file, key) {
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() || undefined;
}

/** KC_ADMIN_PASSWORD from the environment, otherwise from the main checkout's `.env` (made by `make auth-up`). */
export function adminPassword(cwd, env = process.env) {
  const found =
    env["KC_ADMIN_PASSWORD"] || envValue(join(devConfigDir(cwd), ".env"), "KC_ADMIN_PASSWORD");
  if (!found)
    throw new Error("KC_ADMIN_PASSWORD missing: run `make auth-up` in the main checkout first");
  return found;
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The dev realm creates the users `test`, `test2` and `test3` with random Keycloak ids. The account row of the app is
// keyed by that id (the token's `sub`), so the seed must use the real ones or the seeded data would belong to nobody.
export const DEMO_USERS = ["test", "test2", "test3"] as const;
export type DemoUser = (typeof DEMO_USERS)[number];
export type Subjects = Record<DemoUser, string>;

const REALM = "pflanzendex";
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..", "..", "..", "..", ".."); // app/

/** `DEMO_SEED_SUBJECTS=test=<sub>,test2=<sub>,test3=<sub>` (bypass when Keycloak is not reachable, and for tests). */
export function parseSubjects(text: string): Subjects {
  const pairs = Object.fromEntries(
    text.split(",").map((part) => part.trim().split("=") as [string, string]),
  );
  const missing = DEMO_USERS.filter((u) => !pairs[u]);
  if (missing.length) throw new Error(`DEMO_SEED_SUBJECTS lacks: ${missing.join(", ")}`);
  return Object.fromEntries(DEMO_USERS.map((u) => [u, pairs[u]])) as Subjects;
}

function envFileValue(file: string, key: string): string | undefined {
  /* eslint-disable security/detect-non-literal-fs-filename -- fixed dev paths built in this file, no user input */
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  /* eslint-enable security/detect-non-literal-fs-filename */
  return line?.slice(key.length + 1).trim();
}

function adminPassword(): string {
  const fromEnv = process.env["KC_ADMIN_PASSWORD"];
  if (fromEnv) return fromEnv;
  const own = envFileValue(join(appDir, "config", "dev", ".env"), "KC_ADMIN_PASSWORD");
  if (own) return own;
  // A worktree has no `.env` of its own: the main checkout's file (made by `make auth-up`) is the source.
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: appDir,
    encoding: "utf8",
  }).trim();
  const main = envFileValue(
    join(dirname(join(appDir, common)), "app", "config", "dev", ".env"),
    "KC_ADMIN_PASSWORD",
  );
  if (!main) throw new Error("KC_ADMIN_PASSWORD missing: run `make auth-up` first");
  return main;
}

/** Looks the three ids up through the Keycloak admin API (`make auth-up` must be running). */
export async function subjectsFromKeycloak(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Subjects> {
  if (env["DEMO_SEED_SUBJECTS"]) return parseSubjects(env["DEMO_SEED_SUBJECTS"]);
  const keycloak = env["E2E_KEYCLOAK_URL"] ?? "http://localhost:18081";
  const login = await fetch(`${keycloak}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: "admin",
      password: adminPassword(),
    }),
  }).catch(() => {
    throw new Error(
      `Keycloak not reachable at ${keycloak}: run \`make auth-up\` (or set DEMO_SEED_SUBJECTS)`,
    );
  });
  if (!login.ok) throw new Error(`Keycloak admin login failed: ${login.status}`);
  const headers = {
    Authorization: `Bearer ${((await login.json()) as { access_token: string }).access_token}`,
  };
  const entries: [DemoUser, string][] = [];
  for (const user of DEMO_USERS) {
    const found = (await (
      await fetch(`${keycloak}/admin/realms/${REALM}/users?username=${user}&exact=true`, {
        headers,
      })
    ).json()) as { id: string }[];
    if (!found[0])
      throw new Error(
        `Keycloak realm has no user '${user}': run \`make auth-down && make auth-up\``,
      );
    entries.push([user, found[0].id]);
  }
  return Object.fromEntries(entries) as Subjects;
}

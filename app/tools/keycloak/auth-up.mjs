// `make auth-up` (US-DEV-08, issue 1187): starts the shared local Keycloak and mail catcher with the main checkout's
// compose file and `.env`, from any checkout. Only the main checkout creates the `.env`; a worktree without it, or a
// running container started with another admin password, is refused instead of recreated (which would drop every web
// origin added with web-port.mjs and break the sign-in of every other session).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { devConfigDir, envValue, inMainCheckout } from "./dev-env.mjs";

const CONTAINER = "pflanzendex-keycloak";
const RESTORE =
  "To restore it, run `make auth-down && make auth-up` in the main checkout, then `node tools/keycloak/web-port.mjs <port>` " +
  "for every web port in use, and tell the other sessions (docs/guides/operations/parallel-work.md).";

/** Pure: what auth-up does for the given state ("create" the `.env` first, "start", or "refuse" with a reason). */
export function authUpPlan({ isMain, envFile, envPassword, runningPassword }) {
  if (!envPassword && !isMain)
    return {
      action: "refuse",
      reason: `${envFile} is missing: run \`make auth-up\` in the main checkout first. Only the main checkout creates it.`,
    };
  if (!envPassword && runningPassword)
    return {
      action: "refuse",
      reason: `${CONTAINER} is running, but ${envFile} is missing, so a new password would recreate it. ${RESTORE}`,
    };
  if (!envPassword) return { action: "create" };
  if (runningPassword && runningPassword !== envPassword)
    return {
      action: "refuse",
      reason: `${CONTAINER} runs with another admin password than ${envFile}; starting it would recreate it. ${RESTORE}`,
    };
  return { action: "start" };
}

/** Admin password the running (or stopped) container was created with; undefined when there is none. */
function containerPassword() {
  try {
    const env = execFileSync(
      "docker",
      ["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}", CONTAINER],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const line = env.split("\n").find((l) => l.startsWith("KC_BOOTSTRAP_ADMIN_PASSWORD="));
    return line?.slice("KC_BOOTSTRAP_ADMIN_PASSWORD=".length);
  } catch {
    return undefined; // no such container (or no Docker: compose below reports that)
  }
}

function main() {
  const cwd = process.cwd();
  const dir = devConfigDir(cwd);
  const envFile = join(dir, ".env");
  const plan = authUpPlan({
    isMain: inMainCheckout(cwd),
    envFile,
    envPassword: envValue(envFile, "KC_ADMIN_PASSWORD"),
    runningPassword: containerPassword(),
  });
  if (plan.action === "refuse") {
    console.error(`auth-up: ${plan.reason}`);
    process.exit(1);
  }
  if (plan.action === "create") {
    const password = randomBytes(18)
      .toString("base64")
      .replace(/[^A-Za-z0-9]/g, "");
    writeFileSync(envFile, `KC_ADMIN_PASSWORD=${password}\n`, { mode: 0o600 });
  }
  const compose = ["compose", "-f", join(dir, "compose.yaml"), "--env-file", envFile, "up", "-d"];
  execFileSync("docker", compose, { stdio: "inherit" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

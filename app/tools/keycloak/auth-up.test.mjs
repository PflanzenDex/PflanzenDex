// Tests for `make auth-up` (US-DEV-08, issue 1187): the plan as a pure function, then the real script in a throwaway
// repository with a linked worktree and a stubbed docker, so no container is touched.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { authUpPlan } from "./auth-up.mjs";
import { adminPassword, devConfigDir, inMainCheckout, mainCheckout } from "./dev-env.mjs";

const script = new URL("./auth-up.mjs", import.meta.url).pathname;
const envFile = "/main/app/config/dev/.env";

test("US-DEV-08 auth-up: the main checkout creates the .env when there is none and no container", () => {
  assert.deepEqual(authUpPlan({ isMain: true, envFile }), { action: "create" });
});

test("US-DEV-08 auth-up: a worktree never creates the .env (issue 1187)", () => {
  const plan = authUpPlan({ isMain: false, envFile });
  assert.equal(plan.action, "refuse");
  assert.match(plan.reason, /main checkout first/);
});

test("US-DEV-08 auth-up: refuses when the container runs with another password", () => {
  for (const isMain of [true, false]) {
    const plan = authUpPlan({ isMain, envFile, envPassword: "a", runningPassword: "b" });
    assert.equal(plan.action, "refuse");
    assert.match(plan.reason, /another admin password/);
  }
});

test("US-DEV-08 auth-up: refuses a new password while a container runs without a .env", () => {
  assert.equal(authUpPlan({ isMain: true, envFile, runningPassword: "b" }).action, "refuse");
});

test("US-DEV-08 auth-up: starts with the same password or when no container exists", () => {
  for (const isMain of [true, false]) {
    assert.deepEqual(authUpPlan({ isMain, envFile, envPassword: "a", runningPassword: "a" }), {
      action: "start",
    });
    assert.deepEqual(authUpPlan({ isMain, envFile, envPassword: "a" }), { action: "start" });
  }
});

// A repository with app/config/dev and a linked worktree, plus a docker stub that logs its calls and reports the
// container password from STUB_PASSWORD (no container when unset).
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "auth-up-")));
  const main = join(root, "main");
  mkdirSync(join(main, "app", "config", "dev"), { recursive: true });
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git(main, "init", "-q");
  writeFileSync(join(main, "app", "config", "dev", "compose.yaml"), "services: {}\n");
  git(main, "add", ".");
  git(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  const worktree = join(root, "wt");
  git(main, "worktree", "add", "-q", worktree);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
if [ "$1" = inspect ]; then [ -n "\${STUB_PASSWORD:-}" ] || exit 1; echo "KC_BOOTSTRAP_ADMIN_PASSWORD=$STUB_PASSWORD"; fi
`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  const log = join(root, "docker.log");
  const run = (cwd, password) =>
    spawnSync("node", [script], {
      cwd: join(cwd, "app"),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        STUB_LOG: log,
        STUB_PASSWORD: password ?? "",
      },
    });
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { main, worktree, run, calls, env: join(main, "app", "config", "dev", ".env") };
}

test("US-DEV-08 dev-env: a worktree resolves the main checkout (absolute git common dir)", () => {
  const box = sandbox();
  assert.equal(mainCheckout(join(box.worktree, "app")), box.main);
  assert.equal(devConfigDir(join(box.worktree, "app")), join(box.main, "app", "config", "dev"));
  assert.equal(inMainCheckout(join(box.worktree, "app")), false);
  assert.equal(inMainCheckout(join(box.main, "app")), true);
  writeFileSync(box.env, "KC_ADMIN_PASSWORD=secret\n");
  assert.equal(adminPassword(join(box.worktree, "app"), {}), "secret");
});

test("US-DEV-08 auth-up in a worktree without the main .env refuses and calls no compose (issue 1187)", () => {
  const box = sandbox();
  const out = box.run(box.worktree);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /main checkout first/);
  assert.equal(existsSync(box.env), false);
  assert.equal(existsSync(join(box.worktree, "app", "config", "dev", ".env")), false);
  assert.doesNotMatch(box.calls(), /compose/);
});

test("US-DEV-08 auth-up in a worktree uses the main checkout's compose file and .env", () => {
  const box = sandbox();
  writeFileSync(box.env, "KC_ADMIN_PASSWORD=secret\n");
  const out = box.run(box.worktree, "secret");
  assert.equal(out.status, 0, out.stderr);
  const dir = join(box.main, "app", "config", "dev");
  assert.ok(
    box.calls().includes(`compose -f ${dir}/compose.yaml --env-file ${dir}/.env up -d`),
    box.calls(),
  );
});

test("US-DEV-08 auth-up refuses a running container with another password and leaves it alone", () => {
  const box = sandbox();
  writeFileSync(box.env, "KC_ADMIN_PASSWORD=secret\n");
  const out = box.run(box.main, "other");
  assert.equal(out.status, 1);
  assert.match(out.stderr, /another admin password/);
  assert.doesNotMatch(box.calls(), /compose/);
});

test("US-DEV-08 auth-up in the main checkout creates the .env once and starts compose", () => {
  const box = sandbox();
  const out = box.run(box.main);
  assert.equal(out.status, 0, out.stderr);
  const first = readFileSync(box.env, "utf8");
  assert.match(first, /^KC_ADMIN_PASSWORD=[A-Za-z0-9]{16,}\n$/);
  assert.match(box.calls(), /compose .* up -d/);
  const password = first.trim().split("=")[1];
  assert.equal(box.run(box.main, password).status, 0);
  assert.equal(readFileSync(box.env, "utf8"), first);
});

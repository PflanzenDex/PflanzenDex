// Tests for deploy/scripts/apply-env.sh, the allowlist and the order in the Deploy workflow (TE-19, #1013, US-DEV-06).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const deploy = new URL("../../../../config/deploy/", import.meta.url).pathname;
const script = join(deploy, "scripts/apply-env.sh");
const workflow = readFileSync(
  new URL("../../../../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
);
const mode = (path) => statSync(path).mode & 0o777;

function setup(content) {
  const dir = mkdtempSync(join(tmpdir(), "apply-env-"));
  const env = join(dir, ".env");
  if (content !== undefined) {
    writeFileSync(env, content);
    chmodSync(env, 0o600);
  }
  return { dir, env };
}
const run = (env, input) => spawnSync("bash", [script, env], { encoding: "utf8", input });
const backups = (dir) => readdirSync(dir).filter((f) => f.startsWith(".env.bak."));

test("TE-19 apply-env replaces only the given keys and keeps comments, other lines and commented keys (#1013)", () => {
  const { env } = setup("# note\nA=1\n#B=old\nB=2\n\nC=3\n");
  const r = run(env, "B=new\nD=4\n");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(env, "utf8"), "# note\nA=1\n#B=old\nB=new\n\nC=3\nD=4\n");
});

test("TE-19 apply-env logs only key names and changed, added or unchanged, never a value (#1013)", () => {
  const { env } = setup("A=1\nB=2\n");
  const r = run(env, "A=1\nB=SECRETVALUE9\nC=SECRETVALUE8\n");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /apply-env: A unchanged/);
  assert.match(r.stdout, /apply-env: B changed/);
  assert.match(r.stdout, /apply-env: C added/);
  assert.doesNotMatch(r.stdout + r.stderr, /SECRETVALUE/);
});

test("TE-19 apply-env writes a 0600 backup before a change and the new file stays 0600 (#1013)", () => {
  const { dir, env } = setup("A=1\n");
  assert.equal(run(env, "A=2\n").status, 0);
  const [bak] = backups(dir);
  assert.ok(bak);
  assert.equal(readFileSync(join(dir, bak), "utf8"), "A=1\n");
  assert.equal(mode(join(dir, bak)), 0o600);
  assert.equal(mode(env), 0o600);
  assert.deepEqual(
    readdirSync(dir).filter((f) => f.startsWith(".env.new")),
    [],
  );
});

test("TE-19 apply-env changes nothing and writes no backup when all values are already set (#1013)", () => {
  const { dir, env } = setup("A=1\n");
  const r = run(env, "A=1\n");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(backups(dir), []);
  assert.equal(readFileSync(env, "utf8"), "A=1\n");
});

test("TE-19 apply-env keeps the newest 5 backups (#1013)", () => {
  const { dir, env } = setup("A=0\n");
  for (let i = 1; i <= 8; i++) assert.equal(run(env, `A=${i}\n`).status, 0);
  const left = backups(dir).sort();
  assert.equal(left.length, 5);
  // The newest backup holds the state before the last run (A=7).
  assert.equal(readFileSync(join(dir, left.at(-1)), "utf8"), "A=7\n");
  assert.equal(readFileSync(join(dir, left[0]), "utf8"), "A=3\n");
});

test("TE-19 apply-env quotes values that the shell and Compose would otherwise expand (#1013)", () => {
  const { env } = setup("");
  const input =
    "MAIL_UI_HASH=$2a$14$abc#def\nKEYCLOAK_JAVA_HEAP=-Xms128m -Xmx512m\nPLAIN=https://app.example.test:8443\n";
  assert.equal(run(env, input).status, 0);
  const text = readFileSync(env, "utf8");
  assert.equal(
    text,
    "MAIL_UI_HASH='$2a$14$abc#def'\nKEYCLOAK_JAVA_HEAP='-Xms128m -Xmx512m'\nPLAIN=https://app.example.test:8443\n",
  );
  const sourced = spawnSync(
    "bash",
    ["-c", `set -a; . "${env}"; printf '%s|%s' "$MAIL_UI_HASH" "$KEYCLOAK_JAVA_HEAP"`],
    { encoding: "utf8" },
  );
  assert.equal(sourced.stdout, "$2a$14$abc#def|-Xms128m -Xmx512m");
});

test("TE-19 apply-env refuses bad input and leaves the file and the folder untouched (#1013)", () => {
  const bad = [
    "a=1\n", // lower case key
    "1A=1\n", // starts with a digit
    "A B=1\n", // space in the key
    "A\n", // no value separator
    "A=\n", // empty value never overwrites
    "A=x\ty\n", // control character
    "A=x\ry\n",
    "A=it's\n", // single quote
    "A=1\nA=2\n", // key twice
    "A=1\nBAD LINE\n", // second line invalid, first must not be applied
    `A=${"x".repeat(4097)}\n`,
  ];
  for (const input of bad) {
    const { dir, env } = setup("A=orig\n");
    const before = readdirSync(dir).sort();
    const r = run(env, input);
    assert.equal(r.status, 1, JSON.stringify(input.slice(0, 20)));
    assert.match(r.stderr, /ERROR: apply-env/);
    assert.equal(readFileSync(env, "utf8"), "A=orig\n");
    assert.deepEqual(readdirSync(dir).sort(), before);
  }
});

test("TE-19 apply-env never prints the value of a rejected line (#1013)", () => {
  const { env } = setup("A=1\n");
  const r = run(env, "A=SECRET'VALUE\n");
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, /SECRET/);
});

test("TE-19 apply-env with no input does nothing and creates a missing file with mode 0600 only when keys come (#1013)", () => {
  const { dir, env } = setup();
  assert.equal(run(env, "").status, 0);
  assert.deepEqual(readdirSync(dir), []);
  assert.equal(run(env, "A=1\n").status, 0);
  assert.equal(mode(env), 0o600);
  assert.equal(readFileSync(env, "utf8"), "A=1\n");
});

test("TE-19 apply-env drops a duplicate definition of a replaced key (#1013)", () => {
  const { env } = setup("A=1\nB=x\nA=2\n");
  assert.equal(run(env, "A=9\n").status, 0);
  assert.equal(readFileSync(env, "utf8"), "A=9\nB=x\n");
});

// --- Allowlist ---------------------------------------------------------------------------------------------------

// Keys of .env.example that the workflow must never write, with the reason. A new key in the template has to appear
// in the allowlist or here, so somebody decides.
const excluded = {
  POSTGRES_USER:
    "fixed when the database cluster is created; changing it later locks the stack out",
  POSTGRES_PASSWORD:
    "stored in the cluster at creation; the .env value must match it, changing one side breaks the stack",
  POSTGRES_DB: "fixed when the database cluster is created",
  TS_AUTHKEY: "one-time key for the first start of the Funnel nodes, deleted afterwards (runbook)",
};
const envExample = readFileSync(join(deploy, ".env.example"), "utf8");
const templateKeys = new Set([...envExample.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
const allowlist = readFileSync(
  new URL("../../../../../.github/deploy-env-allowlist.txt", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.trim().split(/\s+/));

test("TE-19 every allowlisted key exists in .env.example and has the kind var or secret (#1013)", () => {
  assert.ok(allowlist.length > 0);
  const names = allowlist.map(([key]) => key);
  assert.equal(new Set(names).size, names.length, "duplicate key in the allowlist");
  for (const [key, kind, extra] of allowlist) {
    assert.match(key, /^[A-Z][A-Z0-9_]{0,63}$/);
    assert.ok(templateKeys.has(key), `${key} is not in .env.example`);
    assert.ok(kind === "var" || kind === "secret", `${key}: kind must be var or secret`);
    assert.equal(extra, undefined, `${key}: unexpected extra column`);
  }
});

test("TE-19 every key of .env.example is allowlisted or excluded with a reason, never both (#1013)", () => {
  const names = new Set(allowlist.map(([key]) => key));
  for (const key of templateKeys) {
    assert.ok(
      names.has(key) || key in excluded,
      `${key} is neither in deploy-env-allowlist.txt nor in the exclusion list`,
    );
    assert.ok(!(names.has(key) && key in excluded), `${key} is both allowlisted and excluded`);
  }
  for (const key of Object.keys(excluded))
    assert.ok(templateKeys.has(key), `excluded ${key} is not in .env.example`);
});

test("TE-19 keys that look like credentials are secrets, so the workflow masks them (#1013)", () => {
  for (const [key, kind] of allowlist) {
    if (/PASSWORD|SECRET|TOKEN|AUTHKEY|HASH/.test(key)) assert.equal(kind, "secret", key);
  }
});

// --- Workflow ----------------------------------------------------------------------------------------------------

test("TE-19 the workflow runs guard, apply-env and deploy.sh in this order (#1013)", () => {
  const guard = workflow.indexOf("- id: target");
  const apply = workflow.indexOf("- id: apply_env");
  const deployStep = workflow.indexOf("- id: deploy");
  assert.ok(guard > 0 && guard < apply && apply < deployStep);
  // A failing apply-env step stops the job: nothing after it may be set to continue on error.
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(workflow, /apply-env failed \(exit \$status\); the deploy was not started/);
});

test("TE-19 the workflow sends values over stdin only, masks secrets and reads only the allowlist (#1013)", () => {
  const step = workflow.slice(
    workflow.indexOf("- id: apply_env"),
    workflow.indexOf("- id: deploy"),
  );
  assert.match(step, /printf '%s' "\$payload" \| ssh /);
  assert.match(step, /::add-mask::/);
  assert.match(step, /done < \.github\/deploy-env-allowlist\.txt/);
  assert.doesNotMatch(step, /set -x/);
  // The remote command carries the script and the target path, no value.
  const remote = step.match(/remote="(.*)"$/m)?.[1] ?? "";
  assert.match(remote, /apply-env/);
  assert.doesNotMatch(remote, /\$value|\$payload/);
  // The value variable is used for masking and the payload only, never echoed on its own.
  for (const line of step.split("\n")) {
    if (/\$value|\$payload/.test(line) && /\becho\b/.test(line)) assert.match(line, /::add-mask::/);
  }
});

test("TE-19 the workflow maps exactly the allowlisted secrets, never toJSON(secrets) (#1049)", () => {
  const step = workflow.slice(
    workflow.indexOf("- id: apply_env"),
    workflow.indexOf("- id: deploy"),
  );
  assert.doesNotMatch(workflow, /toJSON\(\s*secrets\s*\)/);
  const mapped = [
    ...step.matchAll(/^\s+SECRET_([A-Z][A-Z0-9_]*): \$\{\{ secrets\.([A-Z][A-Z0-9_]*) \}\}$/gm),
  ];
  for (const [, envName, secretName] of mapped) assert.equal(envName, secretName);
  const allowlisted = allowlist.filter(([, kind]) => kind === "secret").map(([key]) => key);
  assert.deepEqual(mapped.map(([, name]) => name).sort(), allowlisted.sort());
  // No other secret reaches this step.
  assert.equal([...step.matchAll(/secrets\./g)].length, allowlisted.length);
});

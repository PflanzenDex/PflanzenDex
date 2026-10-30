// Which GitHub environment values go into the host's .env (US-DEV-06, TE-19, #1013): allowlist, non-empty only,
// masking, refusal of values .env cannot hold, and the workflow wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedKeys, buildPayload, main, valueProblem } from "./env-payload.mjs";

const read = (path) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), "utf8");
const example = read("app/config/deploy/.env.example");
const workflow = read(".github/workflows/deploy.yml");
const compose = read("app/config/deploy/docker-compose.yml");
const restore = (name, value) => {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value;
};

test("US-DEV-06: the allowlist is derived from .env.example and holds the required keys", () => {
  const { keys, hostOnly } = allowedKeys(example);
  for (const key of [
    "FEATURES",
    "CATALOG_FILL",
    "ATTRIBUTE_FILL",
    "TAXONOMY_BUILD",
    "DB_OWNER_USER",
    "DB_OWNER_PASSWORD",
    "POSTGRES_USER",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "KEYCLOAK_ADMIN_USER",
    "KEYCLOAK_ADMIN_PASSWORD",
    "APP_URL",
    "AUTH_URL",
    "APP_HOST",
    "AUTH_HOST",
    "SMTP_HOST",
    "SMTP_PASSWORD",
  ])
    assert.ok(keys.includes(key), key);
  // Where the dumps go stays on the host: a GitHub value could send them elsewhere.
  assert.deepEqual(hostOnly, ["BACKUP_DIR", "BACKUP_REMOTE"]);
  for (const key of hostOnly) assert.ok(!keys.includes(key), key);
  // Every key of the template is either allowed or host-only, never silently dropped.
  const all = [...example.matchAll(/^#?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
  for (const key of all) assert.ok(keys.includes(key) || hostOnly.includes(key), key);
  for (const key of keys) assert.ok(all.includes(key), key);
});

test("US-DEV-06: every variable docker-compose.yml reads is in .env.example (the allowlist cannot drift)", () => {
  const { keys, hostOnly } = allowedKeys(example);
  const setByDeploy = ["GIT_SHA", "APP_VERSION"]; // exported by deploy.sh from the checked-out commit
  const used = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]));
  for (const key of used)
    if (!setByDeploy.includes(key)) assert.ok(keys.includes(key) || hostOnly.includes(key), key);
});

test("US-DEV-06: comment lines that merely mention KEY= are not keys", () => {
  const { keys } = allowedKeys(
    "# Order: CATALOG_FILL=on\n#  SPACED=1\nREAL=1\n#COMMENTED=\nlower=1\n",
  );
  assert.deepEqual(keys, ["COMMENTED", "REAL"]);
});

test("US-DEV-06: only non-empty, allowlisted values are taken; unknown names are never sent", () => {
  const r = buildPayload({
    vars: { FEATURES: "social,ai", CATALOG_FILL: "", DEPLOY_HOST: "host", UNKNOWN: "x" },
    secrets: {
      DB_OWNER_PASSWORD: "s3cr3t",
      github_token: "ghs_x",
      TS_OAUTH_SECRET: "t",
      POSTGRES_PASSWORD: "",
    },
    allowed: ["FEATURES", "CATALOG_FILL", "DB_OWNER_PASSWORD", "POSTGRES_PASSWORD"],
  });
  assert.deepEqual(r.lines, ["FEATURES=social,ai", "DB_OWNER_PASSWORD=s3cr3t"]);
  assert.deepEqual(r.masks, ["s3cr3t"]);
  assert.deepEqual(r.errors, []);
  assert.ok(!r.log.join("\n").includes("s3cr3t"));
});

test("US-DEV-06: passwords, hashes and auth keys are taken only from secrets", () => {
  const r = buildPayload({
    vars: { POSTGRES_PASSWORD: "plainvar", MAIL_UI_HASH: "h", TS_AUTHKEY: "k", FEATURES: "ai" },
    secrets: {},
    allowed: ["FEATURES", "MAIL_UI_HASH", "POSTGRES_PASSWORD", "TS_AUTHKEY"],
  });
  assert.deepEqual(r.lines, ["FEATURES=ai"]);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join("\n"), /POSTGRES_PASSWORD is set as a variable; set it as a secret/);
  assert.ok(!r.errors.join("\n").includes("plainvar"));
});

test("US-DEV-06: every password key of .env.example can travel as a secret and is masked", () => {
  const { keys } = allowedKeys(example);
  const passwords = keys.filter((k) => /PASSWORD$/.test(k));
  for (const k of [
    "POSTGRES_PASSWORD",
    "DB_OWNER_PASSWORD",
    "KEYCLOAK_DB_PASSWORD",
    "KEYCLOAK_ADMIN_PASSWORD",
    "SMTP_PASSWORD",
  ])
    assert.ok(passwords.includes(k), k);
  const secrets = Object.fromEntries(passwords.map((k) => [k, `value-of-${k}`]));
  const r = buildPayload({ vars: {}, secrets, allowed: keys });
  assert.equal(r.lines.length, passwords.length);
  assert.deepEqual([...r.masks].sort(), Object.values(secrets).sort());
});

test("US-DEV-06: a secret wins over a variable of the same name", () => {
  const r = buildPayload({
    vars: { SMTP_USER: "v" },
    secrets: { SMTP_USER: "s" },
    allowed: ["SMTP_USER"],
  });
  assert.deepEqual(r.lines, ["SMTP_USER=s"]);
  assert.match(r.log[0], /secret wins/);
});

test("US-DEV-06: values with a line break, NUL, quote or backslash are refused by key name", () => {
  for (const bad of ["a\nb", "a\rb", "a\u0000b", "it's", "a\\b", "tab\there"])
    assert.ok(valueProblem(bad), bad);
  for (const ok of ["plain", "with space", "$2a$10$hash", "a#b", 'say "hi"'])
    assert.equal(valueProblem(ok), null, ok);
  const r = buildPayload({
    vars: {},
    secrets: { SMTP_PASSWORD: "line1\nline2" },
    allowed: ["SMTP_PASSWORD"],
  });
  assert.deepEqual(r.lines, []);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^SMTP_PASSWORD \(secret\) contains a line break/);
  assert.ok(!r.errors[0].includes("line1"));
  assert.deepEqual(r.masks, ["line1\nline2"]);
});

test("US-DEV-06: the CLI masks secrets first, writes the payload with mode 600 and never prints a value", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-payload-"));
  const ex = join(dir, "example");
  const out = join(dir, "payload");
  writeFileSync(
    ex,
    "FEATURES=\nDB_OWNER_PASSWORD=x\n#SMTP_HOST=\n# host-only: BACKUP_DIR\nBACKUP_DIR=x\n",
  );
  const saved = { v: process.env.VARS_JSON, s: process.env.SECRETS_JSON };
  process.env.VARS_JSON = JSON.stringify({ FEATURES: "social", BACKUP_DIR: "/evil" });
  process.env.SECRETS_JSON = JSON.stringify({ DB_OWNER_PASSWORD: "topsecret", SMTP_HOST: "" });
  const printed = [];
  try {
    assert.equal(
      main([ex, out], (l) => printed.push(l)),
      0,
    );
  } finally {
    restore("VARS_JSON", saved.v);
    restore("SECRETS_JSON", saved.s);
  }
  assert.equal(printed[0], "::add-mask::topsecret");
  assert.ok(!printed.slice(1).join("\n").includes("topsecret"));
  assert.ok(!printed.join("\n").includes("social"));
  assert.ok(!printed.join("\n").includes("/evil"));
  assert.equal(readFileSync(out, "utf8"), "DB_OWNER_PASSWORD=topsecret\nFEATURES=social\n");
  assert.equal(statSync(out).mode & 0o777, 0o600);
});

test("US-DEV-06: a multi-line secret is masked line by line", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-payload-"));
  const ex = join(dir, "example");
  writeFileSync(ex, "SMTP_PASSWORD=\n");
  const saved = process.env.SECRETS_JSON;
  process.env.SECRETS_JSON = JSON.stringify({ SMTP_PASSWORD: "first\nsecond" });
  const printed = [];
  try {
    assert.equal(
      main([ex, join(dir, "payload")], (l) => printed.push(l)),
      1,
    );
  } finally {
    restore("SECRETS_JSON", saved);
  }
  assert.deepEqual(printed.slice(0, 2), ["::add-mask::first", "::add-mask::second"]);
  for (const l of printed) assert.ok(!l.includes("\n"), l);
});

test("US-DEV-06: a refused value fails the CLI without writing a payload", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-payload-"));
  const ex = join(dir, "example");
  const out = join(dir, "payload");
  writeFileSync(ex, "SMTP_PASSWORD=\n");
  const saved = process.env.SECRETS_JSON;
  process.env.SECRETS_JSON = JSON.stringify({ SMTP_PASSWORD: "a'b" });
  const printed = [];
  try {
    assert.equal(
      main([ex, out], (l) => printed.push(l)),
      1,
    );
  } finally {
    restore("SECRETS_JSON", saved);
  }
  assert.ok(!existsSync(out));
  assert.ok(printed.some((l) => l.startsWith("::error::SMTP_PASSWORD")));
  assert.ok(!printed.slice(1).join("\n").includes("a'b"));
});

test("US-DEV-06: the workflow applies the values after the guard and before deploy.sh, over stdin only", () => {
  const guard = workflow.indexOf("refs/remotes/origin/main");
  const apply = workflow.indexOf("env-payload.mjs");
  const deploy = workflow.indexOf("app/config/deploy/scripts/deploy.sh $(printf");
  assert.ok(guard > -1 && apply > guard && deploy > apply);
  // toJSON(vars/secrets) only as env of the one step that needs it, never in a run block (checked in deploy.test.mjs).
  assert.equal(workflow.match(/\$\{\{ toJSON\(secrets\) \}\}/g).length, 1);
  assert.match(workflow, /^\s+SECRETS_JSON: \$\{\{ toJSON\(secrets\) \}\}$/m);
  assert.match(workflow, /^\s+VARS_JSON: \$\{\{ toJSON\(vars\) \}\}$/m);
  // The step that runs deploy.sh does not see the secrets.
  const deployStep = workflow.slice(workflow.indexOf("- id: deploy"));
  assert.doesNotMatch(deployStep, /toJSON|SECRETS_JSON/);
  // The payload goes to ssh's stdin; the variables are dropped before ssh starts; a failure stops the job.
  assert.match(workflow, /"\$remote" < "\$payload"/);
  assert.ok(workflow.indexOf("unset VARS_JSON SECRETS_JSON") < workflow.indexOf('< "$payload"'));
  assert.match(workflow, /deploy\.apply-env\.sh/);
  const envStep = workflow.slice(workflow.indexOf("- id: env"), workflow.indexOf("- id: deploy"));
  assert.doesNotMatch(envStep, /continue-on-error|\|\| true/);
});

// Tests for deploy/scripts/smoke.sh with a stubbed curl on PATH (no Docker, no network), and for the sign-in check (US-DEV-06,
// #1404) with the real curl against a loopback stand-in for the sign-in service and the api (no Docker, no network beyond
// 127.0.0.1). The deploy harness at the end runs deploy.sh with stubs for git and docker.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs = [];
after(() => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

const smoke = new URL("../../../../config/deploy/scripts/smoke.sh", import.meta.url).pathname;
const deployScript = new URL("../../../../config/deploy/scripts/deploy.sh", import.meta.url)
  .pathname;
const bin = tempDir("smoke-");
// Stub: with -w prints STUB_CODE (web root); for /health/details prints STUB_DETAILS, otherwise STUB_PUBLIC
// (default: the status only); an unset STUB_DETAILS or STUB_PUBLIC="fail" fails like an unreachable route.
writeFileSync(
  join(bin, "curl"),
  `#!/usr/bin/env bash
for a in "$@"; do if [ "$a" = "-w" ]; then printf '%s' "\${STUB_CODE:-200}"; exit 0; fi; done
for a in "$@"; do case "$a" in */health/details)
  if [ -z "\${STUB_DETAILS+x}" ]; then exit 22; fi
  printf '%s' "$STUB_DETAILS"; exit 0 ;;
esac; done
if [ "\${STUB_PUBLIC:-}" = "fail" ]; then exit 22; fi
status='{"status":"ok"}'
printf '%s' "\${STUB_PUBLIC:-$status}"
`,
);
chmodSync(join(bin, "curl"), 0o755);

function run(env, args = ["http://x", "v0.1.0"]) {
  return spawnSync("bash", [smoke, ...args], {
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, SMOKE_RETRIES: "2", SMOKE_DELAY: "0", ...env },
  });
}
const details = (v) =>
  JSON.stringify({ status: "ok", product: "PflanzenDex", version: v, commit: "abc" });

test("ok when version matches and web root is 200", () => {
  const r = run({ STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 0, r.stderr);
});

test("fails when /health/details reports a different version", () => {
  const r = run({ STUB_DETAILS: details("v0.0.9") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /expected 'v0.1.0'/);
});

test("fails when /health is unreachable", () => {
  const r = run({ STUB_PUBLIC: "fail", STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/health not reachable/);
});

test("TE-03 fails when the public /health shows the version (#759)", () => {
  const r = run({ STUB_PUBLIC: details("v0.1.0"), STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /more than the status/);
});

test("fails when /health/details is not readable", () => {
  const r = run({});
  assert.equal(r.status, 1);
  assert.match(r.stderr, /details not readable/);
});

test("TE-03 reads the details through SMOKE_DETAILS_CMD when set (inside the stack, #759)", () => {
  const cmd = `printf '%s' '${details("v0.1.0")}'`;
  assert.equal(run({ SMOKE_DETAILS_CMD: cmd }).status, 0);
  assert.equal(run({ SMOKE_DETAILS_CMD: "exit 1", STUB_DETAILS: details("v0.1.0") }).status, 1);
});

test("fails when the web root is not 200", () => {
  const r = run({ STUB_DETAILS: details("v0.1.0"), STUB_CODE: "502" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /HTTP 502/);
});

test("usage error without arguments", () => {
  assert.equal(run({}, []).status, 2);
});

// --- Sign-in check (US-DEV-06, #1404) ----------------------------------------------------------------------------

test("US-DEV-06 without SMOKE_USER and SMOKE_PASSWORD the sign-in check is skipped with one line and exit 0 when health, version and web root pass", () => {
  const r = run({ STUB_DETAILS: details("v0.1.0") });
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^smoke: sign-in check skipped: SMOKE_USER\/SMOKE_PASSWORD not set \(#1404\)$/m,
  );
  assert.match(r.stdout, /smoke ok: v0.1.0/);
});

test("US-DEV-06 a half configured tester names the missing variable in the skip line (#1404)", () => {
  const onlyUser = run({ STUB_DETAILS: details("v0.1.0"), SMOKE_USER: "smoke-tester" });
  assert.equal(onlyUser.status, 0, onlyUser.stderr);
  assert.match(onlyUser.stdout, /skipped: SMOKE_PASSWORD not set/);
  const onlyPassword = run({ STUB_DETAILS: details("v0.1.0"), SMOKE_PASSWORD: "x" });
  assert.equal(onlyPassword.status, 0, onlyPassword.stderr);
  assert.match(onlyPassword.stdout, /skipped: SMOKE_USER not set/);
});

test("US-DEV-06 the sign-in check is not reached when health already fails (#1404)", () => {
  const r = run({
    STUB_PUBLIC: "fail",
    SMOKE_USER: "smoke-tester",
    SMOKE_PASSWORD: "x",
    SMOKE_AUTH_URL: "http://127.0.0.1:1",
    SMOKE_APP_URL: "https://app.example.test",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/health not reachable/);
  assert.doesNotMatch(r.stdout, /sign-in/);
});

test("US-DEV-06 credentials without the sign-in address fail before anything is checked (#1404)", () => {
  const r = run({
    SMOKE_USER: "smoke-tester",
    SMOKE_PASSWORD: "x",
    STUB_DETAILS: details("v0.1.0"),
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /needs SMOKE_AUTH_URL \(or AUTH_URL\) and SMOKE_APP_URL/);
});

// A stand-in for the sign-in service and the api behind the proxy, answering the way the real services answer curl.
// It checks what the browser flow relies on: the session cookie, the state, the PKCE verifier and the single use of
// the code. The login form names the public address (KC_HOSTNAME), as Keycloak does, while curl reaches 127.0.0.1.
const TESTER = "smoke-tester";
const html = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "text/html", ...headers });
  res.end(body);
};
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

const loginHtml = (authUrl, action) => `<!doctype html><html><body>
<form id="kc-logout" action="${authUrl}/realms/pflanzendex/protocol/openid-connect/logout" method="post"><button>Abmelden</button></form>
<form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${action}" method="post">
  <input id="username" name="username" type="text">
  <input id="password" name="password" type="password">
  <input type="hidden" name="credentialId" value="">
</form></body></html>`;

// GET the login page: checks the request the way Keycloak does, keeps the state and the challenge for the login.
function authorize(s, req, res, url) {
  const q = url.searchParams;
  if (
    q.get("client_id") !== "pflanzendex-web" ||
    q.get("response_type") !== "code" ||
    q.get("code_challenge_method") !== "S256" ||
    q.get("redirect_uri") !== `${s.appUrl}/` ||
    !q.get("code_challenge") ||
    !q.get("state")
  )
    return html(res, 400, "bad authorization request");
  const session = randomUUID();
  s.pending.set(session, {
    challenge: q.get("code_challenge"),
    state: q.get("state"),
    redirect: q.get("redirect_uri"),
  });
  const action = `${s.authUrl}/realms/pflanzendex/login-actions/authenticate?session_code=${session}&amp;client_id=pflanzendex-web&amp;tab_id=t1`;
  const page =
    s.loginPage === "form"
      ? loginHtml(s.authUrl, action)
      : "<!doctype html><html>Wartungsarbeiten</html>";
  return html(res, 200, page, {
    "set-cookie": `AUTH_SESSION_ID=${session}; Path=/realms/pflanzendex/; HttpOnly`,
  });
}

// POST the login: refused answers come back with 200 and no redirect, as Keycloak does.
async function login(s, req, res, url) {
  const session = url.searchParams.get("session_code");
  const entry = s.pending.get(session);
  if (!entry || !String(req.headers.cookie ?? "").includes(`AUTH_SESSION_ID=${session}`))
    return html(res, 400, "Cookie not found");
  const form = new URLSearchParams(await readBody(req));
  s.seen.logins += 1;
  if (form.get("username") !== TESTER || form.get("password") !== s.password)
    return html(res, 200, "<!doctype html><html>Invalid username or password.</html>");
  s.pending.delete(session);
  const code = randomUUID();
  s.codes.set(code, { challenge: entry.challenge, redirect: entry.redirect });
  s.seen.codes.push(code);
  res.writeHead(302, {
    location: `${entry.redirect}?state=${entry.state}&session_state=s1&iss=${encodeURIComponent(`${s.authUrl}/realms/pflanzendex`)}&code=${code}`,
  });
  return res.end();
}

// The token exchange: the code is used once, and the verifier must match the challenge (PKCE S256).
async function token(s, req, res) {
  s.seen.tokenRequests += 1;
  const form = new URLSearchParams(await readBody(req));
  const code = form.get("code") ?? "";
  const entry = s.codes.get(code);
  s.codes.delete(code);
  const verifier = form.get("code_verifier") ?? "";
  s.seen.verifiers.push(verifier);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (
    !entry ||
    form.get("grant_type") !== "authorization_code" ||
    form.get("redirect_uri") !== entry.redirect ||
    form.get("client_id") !== "pflanzendex-web" ||
    challenge !== entry.challenge
  )
    return json(res, 400, { error: "invalid_grant" });
  const access = `tok-${randomUUID()}`;
  s.tokens.add(access);
  return json(res, 200, { access_token: access, token_type: "Bearer", expires_in: 300 });
}

// Heute: only with a token the exchange issued.
function today(s, req, res, url) {
  const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!bearer || !s.tokens.has(bearer)) return json(res, 401, { error: { code: "not_signed_in" } });
  if (!url.searchParams.get("timeZone"))
    return json(res, 400, { error: { code: "input.invalid" } });
  if (s.todayStatus !== 200) return json(res, s.todayStatus, { error: { code: "internal" } });
  return json(res, 200, { date: "2026-11-05", items: [], upcoming: 0 });
}

const stackRoutes = {
  "GET /health": (s, req, res) => json(res, 200, { status: "ok" }),
  "GET /health/details": (s, req, res) =>
    json(res, 200, { status: "ok", product: "PflanzenDex", version: s.version, commit: "abc" }),
  "GET /": (s, req, res) => html(res, 200, "<!doctype html><title>web</title>"),
  "GET /realms/pflanzendex/protocol/openid-connect/auth": authorize,
  "POST /realms/pflanzendex/login-actions/authenticate": login,
  "POST /realms/pflanzendex/protocol/openid-connect/token": token,
  "GET /api/today": today,
};

async function startStack(opts = {}) {
  const s = {
    password: randomUUID(), // per run: no fixed secret in the repository
    todayStatus: 200,
    loginPage: "form",
    version: "v0.1.0",
    ...opts,
    appUrl: "https://app.example.test",
    authUrl: "https://auth.example.test",
    pending: new Map(), // session code -> { challenge, state, redirect }
    codes: new Map(), // code -> { challenge, redirect }
    tokens: new Set(),
    seen: { logins: 0, tokenRequests: 0, verifiers: [], codes: [] },
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://stack");
    const handler = stackRoutes[`${req.method} ${url.pathname}`];
    if (!handler) return html(res, 404, "not found");
    return handler(s, req, res, url);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    appUrl: s.appUrl,
    password: s.password,
    seen: s.seen,
    tokens: s.tokens,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

// Runs smoke.sh asynchronously (the stack answers in this process) with the real curl unless PATH says otherwise.
function runAsync(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [smoke, ...args], {
      env: { PATH: process.env.PATH, SMOKE_RETRIES: "2", SMOKE_DELAY: "0", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// The tester's variables and a private temporary folder for smoke.sh (its cookie jar and curl config live there).
const signIn = (stack, extra = {}) => ({
  TMPDIR: tempDir("smoke-tmp-"),
  SMOKE_USER: TESTER,
  SMOKE_PASSWORD: stack.password,
  SMOKE_AUTH_URL: stack.url,
  SMOKE_APP_URL: stack.appUrl,
  ...extra,
});

test("US-DEV-06 with the tester's credentials the sign-in and Heute pass against the sign-in service and the api", async () => {
  const stack = await startStack();
  try {
    const r = await runAsync(signIn(stack), [stack.url, "v0.1.0"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /smoke: sign-in ok and Heute answered for the smoke user/);
    assert.match(r.stdout, /smoke ok: v0.1.0/);
    assert.equal(stack.seen.logins, 1);
    assert.equal(stack.seen.tokenRequests, 1);
  } finally {
    await stack.close();
  }
});

test("US-DEV-06 a refused sign-in (wrong password) fails the smoke test at once with the reason, and no password is printed", async () => {
  const stack = await startStack();
  const wrong = "not-the-password-x9";
  try {
    const r = await runAsync(signIn(stack, { SMOKE_PASSWORD: wrong }), [stack.url, "v0.1.0"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sign-in refused/);
    assert.match(r.stderr, /not retried/);
    assert.equal(stack.seen.logins, 1, "a refused sign-in is not retried");
    const out = r.stdout + r.stderr;
    assert.ok(!out.includes(wrong), "the wrong password is printed");
    assert.ok(!out.includes(stack.password), "the password is printed");
  } finally {
    await stack.close();
  }
});

test("US-DEV-06 a login page without the login form fails the smoke test with the reason (retried, then failed)", async () => {
  const stack = await startStack({ loginPage: "none" });
  try {
    const r = await runAsync(signIn(stack), [stack.url, "v0.1.0"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /login page has no login form/);
    assert.match(r.stderr, /FAILED after 2 tries/);
  } finally {
    await stack.close();
  }
});

test("US-DEV-06 Heute answering non-200 fails the smoke test after the tries", async () => {
  const stack = await startStack({ todayStatus: 500 });
  try {
    const r = await runAsync(signIn(stack), [stack.url, "v0.1.0"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Heute answered HTTP 500, expected 200/);
    assert.match(r.stderr, /FAILED after 2 tries/);
    assert.equal(stack.seen.logins, 2, "every try signs in again");
  } finally {
    await stack.close();
  }
});

test("US-DEV-06 the password, the token, the code and the verifier never reach a command line, and the output shows none of them", async () => {
  const stack = await startStack();
  // A curl on PATH that writes every argument of every call to a log, then runs the real curl.
  const wrapper = tempDir("smoke-argv-");
  const log = join(wrapper, "argv.log");
  const real = spawnSync("bash", ["-c", "command -v curl"], { encoding: "utf8" }).stdout.trim();
  writeFileSync(
    join(wrapper, "curl"),
    `#!/usr/bin/env bash\nfor a in "$@"; do printf '%s\\n' "$a"; done >> '${log}'\nexec '${real}' "$@"\n`,
  );
  chmodSync(join(wrapper, "curl"), 0o755);
  try {
    const r = await runAsync(signIn(stack, { PATH: `${wrapper}:${process.env.PATH}` }), [
      stack.url,
      "v0.1.0",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(stack.seen.logins, 1);
    assert.equal(stack.tokens.size, 1);
    const argv = readFileSync(log, "utf8");
    assert.match(argv, /openid-connect\/token/, "the recorder saw the token call");
    const secrets = [stack.password, ...stack.seen.codes, ...stack.seen.verifiers, ...stack.tokens];
    for (const secret of secrets)
      assert.ok(!argv.includes(secret), "a secret is on a command line");
    for (const secret of secrets)
      assert.ok(!(r.stdout + r.stderr).includes(secret), "a secret is printed");
  } finally {
    await stack.close();
  }
});

// --- Deploy plumbing (US-DEV-06, #1404): deploy.sh hands the sign-in settings to smoke.sh --------------------------

// The smoke_target function of deploy.sh, extracted as text (deploy.sh runs main when sourced).
function smokeTargetSource() {
  const text = readFileSync(deployScript, "utf8");
  const start = text.indexOf("smoke_target() {");
  const end = text.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start, "smoke_target is in deploy.sh");
  return text.slice(start, end + 3);
}

// Runs smoke_target in a folder with the given .env and prints the base and the exported SMOKE_* variables.
function smokeTargetFor(envText) {
  const dir = tempDir("smoke-target-");
  writeFileSync(join(dir, ".env"), envText);
  const script = `${smokeTargetSource()}\nsmoke_target\nprintf 'base=%s\\n' "$SMOKE_BASE"\nenv | grep -E '^SMOKE_(AUTH_URL|AUTH_CURL_OPTS|CURL_OPTS|USER)=' | sort`;
  const r = spawnSync("bash", ["-c", script], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(r.status, 0, r.stderr);
  return Object.fromEntries(
    r.stdout
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

test("US-DEV-06 behind the proxy (CADDY_SCHEME=http://) the sign-in host gets its own Host header and the tester is exported (#1404)", () => {
  const target = smokeTargetFor(
    [
      "CADDY_SCHEME=http://",
      "APP_HOST=app.example.test",
      "AUTH_HOST=auth.example.test",
      "HTTP_PORT=8080",
      "APP_URL=https://app.example.test",
      "AUTH_URL=https://auth.example.test",
      "SMOKE_USER=smoke-tester",
      "SMOKE_PASSWORD=abc123",
      "",
    ].join("\n"),
  );
  assert.equal(target.base, "http://127.0.0.1:8080");
  assert.equal(target.SMOKE_AUTH_URL, "http://127.0.0.1:8080");
  assert.equal(target.SMOKE_AUTH_CURL_OPTS, "-H Host:auth.example.test");
  assert.equal(target.SMOKE_CURL_OPTS, "-H Host:app.example.test");
  assert.equal(target.SMOKE_USER, "smoke-tester");
});

test("US-DEV-06 on localhost the sign-in host is resolved to the loopback with the local CA allowed (#1404)", () => {
  const target = smokeTargetFor(
    [
      "CADDY_SCHEME=",
      "APP_HOST=localhost",
      "AUTH_HOST=auth.localhost",
      "HTTPS_PORT=8443",
      "SMOKE_USER=smoke-tester",
      "",
    ].join("\n"),
  );
  assert.equal(target.base, "https://localhost:8443");
  assert.equal(target.SMOKE_AUTH_URL, "https://auth.localhost:8443");
  assert.equal(target.SMOKE_AUTH_CURL_OPTS, "-k --resolve auth.localhost:8443:127.0.0.1");
});

// A deploy.sh copy in a folder of its own, with stubs for git and docker compose, and a smoke.sh stub that records what it
// gets and fails on its first call only: the deploy fails, the rollback to the previous commit passes.
function deployHarness() {
  const root = tempDir("deploy-harness-");
  const dep = join(root, "config", "deploy");
  const stubs = join(root, "stubs");
  const log = join(root, "smoke-calls.log");
  mkdirSync(join(dep, "scripts"), { recursive: true });
  mkdirSync(join(dep, "keycloak"), { recursive: true });
  mkdirSync(stubs);
  copyFileSync(deployScript, join(dep, "scripts", "deploy.sh"));
  writeFileSync(join(dep, "proxy.Caddyfile"), "example\n");
  writeFileSync(
    join(dep, ".env"),
    "CADDY_SCHEME=http://\nAPP_HOST=app.example.test\nAUTH_HOST=auth.example.test\nHTTP_PORT=8080\nAPP_URL=https://app.example.test\nAUTH_URL=https://auth.example.test\nSMOKE_USER=smoke-tester\nSMOKE_PASSWORD=pw-deploy-test\n",
  );
  writeFileSync(join(dep, "keycloak", "master-realm.sh"), "#!/usr/bin/env bash\nexit 0\n");
  writeFileSync(
    join(dep, "scripts", "smoke.sh"),
    `#!/usr/bin/env bash
printf 'base=%s auth=%s authopts=%s user=%s password=%s\\n' "$1" "$SMOKE_AUTH_URL" "$SMOKE_AUTH_CURL_OPTS" "$SMOKE_USER" "\${SMOKE_PASSWORD:+set}" >> '${log}'
[ "$(wc -l < '${log}')" -eq 1 ] && exit 1
exit 0
`,
  );
  // docker compose: no volume yet, the api and keycloak answer healthy, no database running (no backup).
  writeFileSync(
    join(stubs, "docker"),
    `#!/usr/bin/env bash
case "$*" in
  *"volume inspect"*) exit 1 ;;
  *"--format"*) printf 'api healthy\\nkeycloak healthy\\n' ;;
esac
exit 0
`,
  );
  writeFileSync(
    join(stubs, "git"),
    `#!/usr/bin/env bash
case "$*" in
  "rev-parse --short HEAD") echo abc1234 ;;
  "rev-parse HEAD") echo abc1234fullsha ;;
  "describe --tags --always") echo v0.1.0 ;;
esac
exit 0
`,
  );
  for (const name of ["docker", "git"]) chmodSync(join(stubs, name), 0o755);
  chmodSync(join(dep, "keycloak", "master-realm.sh"), 0o755);
  chmodSync(join(dep, "scripts", "smoke.sh"), 0o755);
  return { dep, stubs, log };
}

test("US-DEV-06 a failed sign-in smoke test still rolls deploy.sh back, and smoke.sh gets the tester and the sign-in address (#1404)", () => {
  const { dep, stubs, log } = deployHarness();
  const r = spawnSync("bash", [join(dep, "scripts", "deploy.sh")], {
    encoding: "utf8",
    env: { PATH: `${stubs}:${process.env.PATH}` },
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /ERROR: deploy of origin\/main failed; rolling back to abc1234fullsha/);
  assert.match(r.stderr, /ROLLBACK ok: back to v0.1.0/);
  const calls = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(calls.length, 2, "smoke.sh ran for the deploy and for the rollback");
  for (const call of calls) {
    assert.match(call, /auth=http:\/\/127\.0\.0\.1:8080/);
    assert.match(call, /authopts=-H Host:auth\.example\.test/);
    assert.match(call, /user=smoke-tester password=set/);
  }
  assert.doesNotMatch(r.stdout + r.stderr, /pw-deploy-test/);
});

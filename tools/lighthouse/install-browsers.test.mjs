// US-QG-01 (issue 1485): install-browsers.sh stops a stalled part after its limit, retries it once, fails when the retry fails
// too, restores and keeps the apt cache only for a complete install, and proves the browser present. Stand-ins for npx and
// sudo come first on PATH: nothing is installed, no process is killed and no file outside the temporary folders is written.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = new URL("./install-browsers.sh", import.meta.url).pathname;
// The stalls need GNU timeout (macOS has none by default), so the tests are skipped without it.
const hasTimeout = spawnSync("sh", ["-c", "command -v timeout"]).status === 0;

// npx stand-in: logs its arguments and answers each call of its part with the next outcome of the plan (ok, fail or stall);
// calls beyond the plan succeed.
const NPX = `#!/bin/sh
echo "npx $*" >> "$BROWSER_TEST_LOG"
case "$*" in *install-deps*) part=deps ;; *) part=download ;; esac
count_file="$BROWSER_TEST_DIR/$part.count"
n=$(cat "$count_file" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$count_file"
case "$part" in deps) plan=$BROWSER_TEST_PLAN_DEPS ;; *) plan=$BROWSER_TEST_PLAN_DOWNLOAD ;; esac
outcome=$(printf '%s\\n' $plan | sed -n "\${n}p")
case "$outcome" in
  fail) exit 1 ;;
  stall) sleep 60 ;;
  *) exit 0 ;;
esac
`;

// sudo stand-in: logs its arguments; only `cp` runs, because the script copies the cache into the temporary archive folder.
const SUDO = `#!/bin/sh
echo "sudo $*" >> "$BROWSER_TEST_LOG"
case "$1" in
  cp) shift; exec cp "$@" ;;
  *) exit 0 ;;
esac
`;

function run({
  deps = "ok",
  download = "ok",
  cache = false,
  cachedDebs = [],
  archivedDebs = [],
  browserPresent = true,
  limits = true,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "browsers-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "log");
  writeFileSync(log, "");
  for (const [name, body] of [
    ["npx", NPX],
    ["sudo", SUDO],
  ]) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const archives = join(dir, "archives");
  const cacheDir = join(dir, "cache");
  mkdirSync(archives);
  mkdirSync(cacheDir);
  for (const name of cachedDebs) writeFileSync(join(cacheDir, name), "deb");
  for (const name of archivedDebs) writeFileSync(join(archives, name), "deb");
  const chrome = join(dir, "chrome");
  if (browserPresent) {
    writeFileSync(chrome, "#!/bin/sh\n");
    chmodSync(chrome, 0o755);
  }
  const result = spawnSync("sh", [SCRIPT], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BROWSER_TEST_DIR: dir,
      BROWSER_TEST_LOG: log,
      BROWSER_TEST_PLAN_DEPS: deps,
      BROWSER_TEST_PLAN_DOWNLOAD: download,
      PFLANZENDEX_APT_ARCHIVES: archives,
      PFLANZENDEX_APT_CACHE: cache ? cacheDir : "",
      PFLANZENDEX_BROWSER_EXECUTABLE: chrome,
      ...(limits
        ? {
            PFLANZENDEX_BROWSER_SYSTEM_LIMIT: "2",
            PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT: "2",
          }
        : {}),
    },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
    calls,
    archives: () => listFolder(archives),
    cached: () => listFolder(cacheDir),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const listFolder = (folder) => (existsSync(folder) ? readdirSync(folder).sort() : []);

const APT = "npx --no-install playwright install-deps chromium";
const DOWNLOAD = "npx --no-install playwright install chromium";
const DEBS = ["fonts-freefont-ttf_20211204_all.deb", "xfonts-utils_7.7_amd64.deb"];

test(
  "US-QG-01: a healthy install without a cache runs both parts once and keeps nothing",
  { skip: !hasTimeout },
  () => {
    const r = run({});
    try {
      assert.equal(r.status, 0, r.stderr);
      // The parts run at the same time (issue 1667), so their order in the log is not fixed.
      assert.deepEqual([...r.calls].sort(), [DOWNLOAD, APT].sort());
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: a complete install with the cache on keeps the packages and the COMPLETE marker",
  { skip: !hasTimeout },
  () => {
    const r = run({ cache: true, archivedDebs: DEBS });
    try {
      assert.equal(r.status, 0, r.stderr);
      assert.ok(
        r.calls.some((c) =>
          c.startsWith("sudo tee /etc/apt/apt.conf.d/99pflanzendex-keep-packages"),
        ),
      );
      assert.deepEqual(r.cached(), [...DEBS, "COMPLETE"].sort());
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: a cache hit restores the packages before apt runs, and apt is still asked to install",
  { skip: !hasTimeout },
  () => {
    const r = run({ cache: true, cachedDebs: DEBS });
    try {
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.calls.some((c) => c.startsWith("sudo cp -n")));
      assert.ok(r.calls.includes(APT));
      assert.deepEqual(r.archives(), DEBS);
      assert.match(r.stdout, /restoring the cached system packages/);
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: a stalled apt part is stopped after its limit, dpkg is repaired and the part runs once more",
  { skip: !hasTimeout },
  () => {
    const r = run({ deps: "stall ok" });
    try {
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(
        r.calls.filter((c) => c.startsWith("npx")).sort(),
        [APT, APT, DOWNLOAD].sort(),
      );
      assert.ok(r.calls.includes("sudo pkill -KILL -x apt-get"));
      assert.ok(r.calls.includes("sudo dpkg --configure -a"));
      assert.match(
        r.stderr,
        /system packages \(apt\) failed or took longer than 2 s \(attempt 1 of 2\)/,
      );
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: an apt part that stalls twice fails the job by name, and nothing is kept",
  { skip: !hasTimeout },
  () => {
    const r = run({ deps: "stall stall", cache: true, archivedDebs: DEBS });
    try {
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /system packages \(apt\) .*\(attempt 2 of 2\)/);
      // The download runs at the same time and passed, yet the install fails and nothing is kept (issue 1667).
      assert.doesNotMatch(r.stderr, /no Chromium at/);
      assert.deepEqual(r.cached(), []);
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: a failed browser download is retried once, and a second failure fails the job",
  { skip: !hasTimeout },
  () => {
    const retried = run({ download: "fail ok" });
    try {
      assert.equal(retried.status, 0, retried.stderr);
      assert.equal(retried.calls.filter((c) => c === DOWNLOAD).length, 2);
    } finally {
      retried.cleanup();
    }
    const failed = run({ download: "fail fail" });
    try {
      assert.notEqual(failed.status, 0);
      assert.match(
        failed.stderr,
        /Chromium download failed or took longer than 2 s \(attempt 2 of 2\)/,
      );
    } finally {
      failed.cleanup();
    }
  },
);

test(
  "US-QG-01: a failed browser download is retried without touching apt, which runs at the same time",
  { skip: !hasTimeout },
  () => {
    const r = run({ download: "fail ok" });
    try {
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.calls.filter((c) => c === APT).length, 1);
      assert.ok(!r.calls.some((c) => c.startsWith("sudo pkill") || c.startsWith("sudo dpkg")));
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: a missing browser fails the job before any test, and nothing is kept",
  { skip: !hasTimeout },
  () => {
    const r = run({ cache: true, archivedDebs: DEBS, browserPresent: false });
    try {
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /no Chromium at .* after the install/);
      assert.deepEqual(r.cached(), []);
    } finally {
      r.cleanup();
    }
  },
);

test(
  "US-QG-01: an install that kept no packages succeeds but saves no cache",
  { skip: !hasTimeout },
  () => {
    const r = run({ cache: true });
    try {
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /no complete set of system packages to keep; the cache is not saved/);
      assert.deepEqual(r.cached(), []);
    } finally {
      r.cleanup();
    }
  },
);

test("US-QG-01: the defaults give the throttled apt download room: 720 s for apt and 180 s for the browser", () => {
  const text = readFileSync(SCRIPT, "utf8");
  assert.match(text, /PFLANZENDEX_BROWSER_SYSTEM_LIMIT:-720/);
  assert.match(text, /PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT:-180/);
});

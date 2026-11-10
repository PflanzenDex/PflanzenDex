#!/usr/bin/env node
// `make ci` (US-QG-02, issue 1636): every part of the local CI, one at a time, and every part runs also after a failure. The
// failures are listed at the end with the command that re-runs each one, and the exit code is 1 when a part failed. The
// parts, their order and their dependencies are CI_PARTS in gate-steps.mjs; the commands run as in `npm run gates`, with the
// output of a part printed whole when it ends. Placed here because app/tools/check/quality/ is at its layout limit.
// One heavy job at a time (US-DEV-08, issue 1745): before the first part, the runner takes the machine-wide lock of
// tools/lint/heavy-lock.sh, so `make ci` keeps no prerequisite that could stop it. The owner is the make process that started
// it (PFLANZENDEX_HEAVY_OWNER, exported by the Makefile), or this process when npm runs it directly; the parts inherit the
// owner, so a heavy make target among them does not wait for itself. CI skips the lock: each CI job is its own machine.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCiParts } from "../../check/quality/gates/gate-steps.mjs";
import { formatBlock, runArgv } from "../../check/quality/gates/run-gates.mjs";

function heavyLock() {
  if (process.env.CI) return 0;
  process.env.PFLANZENDEX_HEAVY_OWNER ||= String(process.pid);
  const script = fileURLToPath(new URL("../../../../tools/lint/heavy-lock.sh", import.meta.url));
  const lock = spawnSync(script, [process.env.PFLANZENDEX_HEAVY_OWNER, "ci"], { stdio: "inherit" });
  return lock.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const locked = heavyLock();
  if (locked !== 0) process.exit(locked);
  const { code, summary } = await runCiParts({
    runOne: (step) => runArgv(step),
    onDone: (result) => process.stdout.write(formatBlock(result)),
  });
  process.stdout.write(summary);
  process.exitCode = code;
}

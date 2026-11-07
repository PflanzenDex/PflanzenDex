#!/usr/bin/env node
// `make ci` (US-QG-02, issue 1636): every part of the local CI, one at a time, and every part runs also after a failure. The
// failures are listed at the end with the command that re-runs each one, and the exit code is 1 when a part failed. The
// parts, their order and their dependencies are CI_PARTS in gate-steps.mjs; the commands run as in `npm run gates`, with the
// output of a part printed whole when it ends. Placed here because app/tools/check/quality/ is at its layout limit.
import { fileURLToPath } from "node:url";
import { runCiParts } from "../../check/quality/gates/gate-steps.mjs";
import { formatBlock, runArgv } from "../../check/quality/gates/run-gates.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { code, summary } = await runCiParts({
    runOne: (step) => runArgv(step),
    onDone: (result) => process.stdout.write(formatBlock(result)),
  });
  process.stdout.write(summary);
  process.exitCode = code;
}

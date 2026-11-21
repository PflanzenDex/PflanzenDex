// FR-QG-09 / issue 1733: the server that answers a Lighthouse port must serve the index.html of the build just made.
// A stale preview on the port would otherwise be measured without a word. Usage (called by lighthouse-run.sh):
//   node tools/lighthouse/preview/served-build.mjs <url> <dist-index.html>
// Exit 0 when the page at <url> is byte for byte the file. Exit 1 with a message on stderr otherwise: another build on the
// port, an HTTP error, or no answer within SERVED_BUILD_TIMEOUT_MS (default 5000). Tests: served-build.test.mjs.
import { createHash } from "node:crypto";
import fs from "node:fs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

/** The verdict for the page at url against the file: { code: 0 } when they are equal, else { code: 1, message }. */
async function verdict(url, file, timeoutMs) {
  if (!fs.existsSync(file))
    return { code: 1, message: `lighthouse: ${file} is missing; the web build did not write it` };
  const built = fs.readFileSync(file);
  let served;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok)
      return {
        code: 1,
        message: `lighthouse: ${url} answers HTTP ${response.status}, not the index.html of dist/`,
      };
    served = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const reason =
      error.name === "TimeoutError"
        ? `no answer within ${timeoutMs} ms`
        : (error.cause?.code ?? error.message);
    return { code: 1, message: `lighthouse: nothing answers at ${url} (${reason})` };
  }
  if (served.equals(built)) return { code: 0, message: "" };
  const port = new URL(url).port || "80";
  return {
    code: 1,
    message: `lighthouse: port ${port} serves another build than dist/; stop the old preview (served ${digest(served)}, dist ${digest(built)})`,
  };
}

const [url, file] = process.argv.slice(2);
const result =
  url && file
    ? await verdict(url, file, Number(process.env["SERVED_BUILD_TIMEOUT_MS"] ?? 5000))
    : { code: 1, message: "usage: served-build.mjs <url> <dist-index.html>" };

// The message is written before the exit: process.exit alone can cut a pipe's output short on macOS.
if (result.message) process.stderr.write(`${result.message}\n`, () => process.exit(result.code));
else process.exit(result.code);

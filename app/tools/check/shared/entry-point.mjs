// Whether the running module is the script that Node was started with (US-QG-02, issue 2290). Node resolves symlinks in
// import.meta.url but keeps the path as typed in process.argv[1]: a check started through a symlinked path (on macOS the
// temporary folder under /var/folders is one) would not match and would exit 0 without checking anything. Both paths are
// resolved here. One helper, so the guard is not copied into every script (QG-K4). Returns false, never throws, when
// argv[1] is missing or cannot be read (for example `node -` from stdin).
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function isEntryPoint(importMetaUrl) {
  const started = process.argv[1];
  if (!started) return false;
  let startedPath;
  try {
    startedPath = fs.realpathSync(started);
  } catch {
    return false;
  }
  return startedPath === fs.realpathSync(fileURLToPath(importMetaUrl));
}

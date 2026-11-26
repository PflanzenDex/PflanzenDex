// Seals for the hook records (US-QG-07, issue 2554, second round). Each sealed record has a sidecar file with an HMAC-SHA256
// of its text. The key lives in the git common folder (shared by the worktrees), created once with mode 0600. A record or a
// log line whose MAC does not match is unsigned: the hook then asks, and the log shows UNSIGNED. This stops a forged record
// written without the key. It does not stop an agent that can read the key with its own code (see the report).
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KEY_FILE } from "./gate-names.mjs";

export const MAC_SUFFIX = ".mac";

// The key of the repository's records: read, or created on first use. Created exclusively, so two writers cannot race.
export function keyOf(common) {
  const file = path.join(common, KEY_FILE);
  if (!fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, `${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  return fs.readFileSync(file, "utf8").trim();
}

export const macOf = (key, text) => createHmac("sha256", key).update(text).digest("hex");

// Writes the text of a record and its MAC beside it.
export function sealWrite(file, key, text) {
  fs.writeFileSync(file, text);
  fs.writeFileSync(`${file}${MAC_SUFFIX}`, `${macOf(key, text)}\n`);
}

// The text of a sealed record when its MAC matches, else null. A missing, unreadable or unsigned record reads as null (fail closed).
export function sealRead(file, key) {
  try {
    const text = fs.readFileSync(file, "utf8");
    const mac = fs.readFileSync(`${file}${MAC_SUFFIX}`, "utf8").trim();
    return mac === macOf(key, text) ? text : null;
  } catch {
    return null;
  }
}

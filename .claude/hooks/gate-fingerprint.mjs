// The fingerprint of the gate files of a worktree (US-QG-07, issue 2554, second layer). The denylist of the Bash guard cannot name
// every way a shell writes a file, so the hook also takes the fingerprint of the gate files before each Bash command (guard-bash)
// and after it (after-bash). A change of the content in between blocks the next step, and a state that cannot be read blocks too.
// Round 3 (d-146): the content is hashed every time, streamed in chunks; no entry is reused by mtime or size. A file above the
// cap is not hashed: the fingerprint then throws, and the caller blocks (fail closed). Any other read error throws as well.
// The fingerprint is { "<path>": [mtimeMs, size, sha256] }; a change counts only when the content hash differs.
// Issue 2557 (d-148): a gate file whose content equals its blob in origin/dev is reviewed work that a fast-forward, a merge of
// origin/dev or a fresh worktree brought in; it does not block and is logged as `applied (origin/dev)`.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sealRead, sealWrite } from "./gate-seal.mjs";

export const HASH_CAP = 64 * 1024 * 1024;
export const APPLIED_FROM_DEV = "applied (origin/dev)";
const CHUNK = 64 * 1024;

// The entry of one file: its stat and the hash of its whole content. A file that is missing has no entry; any other error throws.
function entryOf(abs) {
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile()) return null;
  if (stat.size > HASH_CAP)
    throw new Error(`${abs} is too large to fingerprint (${stat.size} bytes)`);
  const hash = createHash("sha256");
  const fd = fs.openSync(abs, "r");
  try {
    const buffer = Buffer.alloc(CHUNK);
    for (
      let n = fs.readSync(fd, buffer, 0, CHUNK, null);
      n > 0;
      n = fs.readSync(fd, buffer, 0, CHUNK, null)
    )
      hash.update(buffer.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return [stat.mtimeMs, stat.size, hash.digest("hex")];
}

// The fingerprint of the given paths, relative to `root`.
export function takeFingerprint(root, paths) {
  const files = {};
  for (const rel of paths) {
    const entry = entryOf(path.join(root, rel));
    if (entry) files[rel] = entry;
  }
  return files;
}

// The paths whose content differs between two fingerprints: added, removed or changed. Sorted.
export function changedPaths(previous, next) {
  const same = (a, b) =>
    (a === undefined && b === undefined) || (a !== undefined && b !== undefined && a[2] === b[2]);
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].filter((key) => !same(previous[key], next[key])).sort();
}

const gitOut = (folder, args, input) => {
  const result = spawnSync("git", args, {
    cwd: folder,
    input,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed (${result.status})`);
  return result.stdout;
};

// The blob ids of origin/dev, { "<path>": "<oid>" }, for the paths that `keep` accepts. Throws when origin/dev is missing or git
// fails; the caller then keeps the block (fail closed). Two git calls in all, whatever the number of files.
export function originDevBlobs(folder, keep) {
  gitOut(folder, ["rev-parse", "--verify", "-q", "origin/dev^{commit}"]);
  const blobs = {};
  const tree = gitOut(folder, ["ls-tree", "-r", "-z", "--full-tree", "origin/dev"]);
  for (const line of tree.split("\0")) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(line);
    if (match && keep(match[2])) blobs[match[2]] = match[1];
  }
  return blobs;
}

// The paths of `rels` whose file in the worktree at `folder` equals its blob in `blobs` (a file absent in both counts as equal),
// as a Set. Any git error throws (fail closed).
export function matchingOriginDev(folder, rels, blobs) {
  const present = rels.filter((rel) => fs.existsSync(path.join(folder, rel)));
  const ids = present.length
    ? gitOut(folder, ["hash-object", "--no-filters", "--stdin-paths"], `${present.join("\n")}\n`)
        .trim()
        .split("\n")
    : [];
  if (ids.length !== present.length) throw new Error("git hash-object returned a wrong count");
  const local = Object.fromEntries(present.map((rel, i) => [rel, ids[i]]));
  return new Set(rels.filter((rel) => local[rel] === blobs[rel]));
}

// The stored fingerprint, or null when it is missing, unsigned or unreadable (the caller then blocks, fail closed).
export function loadFingerprint(file, key) {
  const text = sealRead(file, key);
  if (text === null) return null;
  try {
    const record = JSON.parse(text);
    return record && typeof record.files === "object" && record.files !== null
      ? record.files
      : null;
  } catch {
    return null;
  }
}

export function storeFingerprint(file, key, files) {
  sealWrite(file, key, `${JSON.stringify({ files })}\n`);
}

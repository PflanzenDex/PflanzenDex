// Layout manifests (US-QG-09, FR-QG-21, owner decision d-136): the frontmatter of the README.md of a directory holds
// `topic` (what the folder holds), `why` (why its files belong together) and `expect` (the units it may hold). Pure: the
// text is given by the caller. A README.md without frontmatter is no manifest.
import { isIgnored } from "./layout-tree.mjs";

// The README.md of a folder that the layout check counts; a folder with a dot is no part of the layout.
export const isManifestPath = (p) => p.split("/").at(-1) === "README.md" && !isIgnored(p);

// The lines between the first `---` line and the next one; null when the text has no closed frontmatter.
function frontmatterOf(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  return end < 0 ? null : lines.slice(1, end);
}

// A quoted value is read without its quotes.
function unquote(value) {
  const first = value.charAt(0);
  const quoted = value.length > 1 && (first === '"' || first === "'") && value.endsWith(first);
  return quoted ? value.slice(1, -1).trim() : value;
}

// The `key: value` lines; other lines (blank, comments) are ignored, and a missing key is reported by problemsOf.
function fieldsOf(lines) {
  const fields = {};
  for (const line of lines) {
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (match) fields[match[1]] = unquote(match[2].trim());
  }
  return fields;
}

// A whole number above 0 (`expect`), within the safe integers.
const isWhole = (value) =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

// LY-7: the problems of a malformed manifest, one short text per problem (the key and what is wrong with it).
function problemsOf(fields) {
  const problems = [];
  for (const key of ["topic", "why"]) {
    if (fields[key] === undefined) problems.push(`${key} missing`);
    else if (fields[key] === "") problems.push(`${key} empty`);
  }
  if (fields.expect === undefined) problems.push("expect missing");
  else if (!isWhole(fields.expect))
    problems.push(`expect "${fields.expect}" is not a whole number above 0`);
  return problems;
}

/**
 * The manifest of a README.md text: { state: "none" } without frontmatter, { state: "bad", problems } when a key is
 * missing, empty or not a whole number above 0 (LY-7), and { state: "ok", topic, why, expect } otherwise.
 */
export function parseManifest(text) {
  const lines = frontmatterOf(text);
  if (lines === null) return { state: "none" };
  const fields = fieldsOf(lines);
  const problems = problemsOf(fields);
  if (problems.length) return { state: "bad", problems };
  return { state: "ok", topic: fields.topic, why: fields.why, expect: Number(fields.expect) };
}

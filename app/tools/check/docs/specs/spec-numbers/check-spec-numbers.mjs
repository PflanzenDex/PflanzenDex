// Spec numbers match code constants (FR-QG-13). A marker right after a number in docs/specs/product/*.md names the
// export of `@pflanzendex/core` that holds it:   2 <!-- const: REPLENISH_BUFFER_LIMITS.default -->
// The number is the one directly before the marker (`2`, `±10 %`, `200,000`, `30 days`). `scale=100` says the constant
// is a fraction shown as percent (spec `10 %`, code `0.1`). Codes: SN-1 differs, SN-2 constant missing, SN-3 no number,
// SN-4 a constant of app/config/project/spec-numbers.json lost its marker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = /<!--\s*const:\s*([^\s>]+)([^>]*)-->/g;

export function parseSpecNumber(before) {
  const text = before
    .trimEnd()
    .replace(/\*+$/, "")
    .replace(/\s*(?:%|[A-Za-z]+)$/, "");
  const digits = text.match(/[\d.,]+$/)?.[0].replace(/,/g, "");
  return digits !== undefined && /\d/.test(digits) && !Number.isNaN(Number(digits))
    ? Number(digits)
    : null;
}

export function findMarkers(files) {
  const markers = [];
  for (const [file, text] of Object.entries(files))
    text.split("\n").forEach((raw, i) => {
      const line = raw.replace(/`[^`]*`/g, (code) => " ".repeat(code.length)); // examples in code spans are no markers
      for (const m of line.matchAll(MARKER)) {
        const options = Object.fromEntries(
          [...(m[2] ?? "").matchAll(/([a-z]+)=(\S+)/g)].map((o) => [o[1], o[2]]),
        );
        const where = `${path.basename(file)}:${i + 1}`;
        markers.push({
          where,
          path: m[1],
          scale: Number(options.scale ?? 1),
          value: parseSpecNumber(line.slice(0, m.index)),
        });
      }
    });
  return markers;
}

export function resolveConstant(constants, dotted) {
  let node = constants;
  for (const key of dotted.split(".")) {
    if (node === null || typeof node !== "object" || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

const same = (a, b) => Math.abs(a - b) < 1e-9;

function checkMarker(marker, constants) {
  const { where, path: name, scale, value } = marker;
  const code = resolveConstant(constants, name);
  if (typeof code !== "number")
    return `${where}: SN-2 marker names ${name}, but @pflanzendex/core has no numeric constant there`;
  if (value === null) return `${where}: SN-3 marker for ${name} has no number directly before it`;
  if (!same(value / scale, code))
    return `${where}: SN-1 spec says ${value}${scale === 1 ? "" : ` (scale ${scale})`}, code ${name} is ${code}`;
  return null;
}

/** `registered`: constants that must stay marked somewhere in the spec. */
export function findProblems(files, constants, registered) {
  const markers = findMarkers(files);
  const problems = markers.map((m) => checkMarker(m, constants)).filter(Boolean);
  const marked = new Set(markers.map((m) => m.path));
  for (const name of registered)
    if (!marked.has(name))
      problems.push(`SN-4 ${name} is registered but no spec marker names it any more`);
  return problems;
}

async function main() {
  const root = fileURLToPath(new URL("../../../../../..", import.meta.url));
  const dir = path.join(root, "docs/specs/product");
  const files = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".md"))
      .sort()
      .map((n) => [n, fs.readFileSync(path.join(dir, n), "utf8")]),
  );
  const registered = JSON.parse(
    fs.readFileSync(path.join(root, "app/config/project/spec-numbers.json"), "utf8"),
  ).constants;
  const constants = await import("@pflanzendex/core");
  const problems = findProblems(files, constants, registered);
  problems.forEach((p) => console.error(`check-spec-numbers: ${p}`));
  if (problems.length) process.exit(1);
  console.log(
    `check-spec-numbers: ${findMarkers(files).length} marked numbers match core, ${registered.length} constants registered`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

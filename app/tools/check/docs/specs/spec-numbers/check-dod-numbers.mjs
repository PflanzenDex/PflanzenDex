// DoD numbers match the gate configuration (FR-QG-18, QG-U11). Threshold values stand once in app/config/{gates,lint};
// a number repeated in a DoD document carries a marker right after it that names the config value:
//   at most 5 <!-- gate: layout.config.mjs#default.maxUnits --> units per directory
// File is resolved in app/config/gates/ or app/config/lint/; JSON by dotted path, .mjs by dotted path from its exports.
// Codes: DN-1 threshold-like number without marker (a number followed by `%`, or a number on a line that talks about
// coverage, complexity, lines, units, parameters, depth, duplicates, bundle, Lighthouse), DN-2 marked number differs
// from the config, DN-3 marked path or file does not exist. Markers inside code spans are examples and ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSpecNumber, resolveConstant } from "./check-spec-numbers.mjs";

export const DOD_FILES = [".github/pull_request_template.md", "AGENTS.md", "CONTRIBUTING.md"];
const CONFIG_DIRS = ["app/config/gates", "app/config/lint"];
const MARKER = /<!--\s*gate:\s*([^\s#>]+)#([^\s>]+)\s*-->/g;
const TOPIC =
  /coverage|complexity|cognitive|lines|units|parameters|depth|duplicat|bundle|lighthouse/i;
const NUMBER = /(?<![\w.#/-])\d[\d.,]*(?![\w/-])/g;
const MARKER_AFTER = /^\s*%?\s*[A-Za-z]*\**\s*<!--\s*gate:/;

const blank = (s) => s.replace(/`[^`]*`/g, (c) => " ".repeat(c.length));

export function findUnmarked(files) {
  const problems = [];
  for (const [file, text] of Object.entries(files))
    text.split("\n").forEach((raw, i) => {
      const line = blank(raw);
      const topic = TOPIC.test(line.replace(/<!--.*?-->/g, ""));
      for (const m of line.matchAll(NUMBER)) {
        const rest = line.slice(m.index + m[0].length);
        const percent = /^\s*%/.test(rest);
        if ((percent || topic) && !MARKER_AFTER.test(rest))
          problems.push(
            `${file}:${i + 1}: DN-1 number ${m[0].replace(/[.,]+$/, "")}${percent ? " %" : ""} looks like a threshold but has no <!-- gate: file#path --> marker`,
          );
      }
    });
  return problems;
}

export function findMarkers(files) {
  const markers = [];
  for (const [file, text] of Object.entries(files))
    text.split("\n").forEach((raw, i) => {
      const line = blank(raw);
      for (const m of line.matchAll(MARKER))
        markers.push({
          where: `${file}:${i + 1}`,
          file: m[1],
          path: m[2],
          value: parseSpecNumber(line.slice(0, m.index)),
        });
    });
  return markers;
}

/** `configs`: config file name -> parsed content (JSON object or module namespace). */
export function findProblems(files, configs) {
  const problems = findUnmarked(files);
  for (const { where, file, path: dotted, value } of findMarkers(files)) {
    const actual = file in configs ? resolveConstant(configs[file], dotted) : undefined;
    if (typeof actual !== "number") {
      problems.push(
        `${where}: DN-3 marker names ${file}#${dotted}, but there is no numeric value there`,
      );
    } else if (value !== actual) {
      problems.push(`${where}: DN-2 document says ${value}, ${file}#${dotted} is ${actual}`);
    }
  }
  return problems;
}

async function loadConfigs(root) {
  const configs = {};
  for (const dir of CONFIG_DIRS)
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const full = path.join(root, dir, name);
      if (name.endsWith(".json")) configs[name] = JSON.parse(fs.readFileSync(full, "utf8"));
      else if (name.endsWith(".mjs")) configs[name] = await import(pathToFileURL(full).href);
    }
  return configs;
}

async function main() {
  const root = fileURLToPath(new URL("../../../../../..", import.meta.url));
  const files = Object.fromEntries(
    DOD_FILES.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]),
  );
  const problems = findProblems(files, await loadConfigs(root));
  problems.forEach((p) => console.error(`check-dod-numbers: ${p}`));
  if (problems.length) process.exit(1);
  console.log(
    `check-dod-numbers: ${findMarkers(files).length} marked DoD numbers match the gate configuration`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

// Report: tests per ✅/🟨 story or requirement and the pure-logic areas of US-QS-02 (report only, exit 0).
// The blocking gate for ✅ stories without a test is check-traceability.mjs (US-QG-04); this adds the numbers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { areaRows, countByStoryId, parseStatuses, storyRows } from "./story-tests-lib.mjs";

export const AREAS = [
  { name: "Care phase", match: /\/care\/phases\// },
  { name: "Growth rate", match: /\/[a-z-]*\brate\b[a-z-]*\.ts$/ },
  { name: "Growth trend", match: /trend/ },
  { name: "Light zone counting", match: /\/collection\/distribution\// },
  { name: "Prioritization", match: /\/wishlist\/candidates\// },
  { name: "Naming rule", match: /\/(?:wishlist\/name-key|pokedex\/ownership\/species-key)/ },
  { name: "Rank", match: /\/pokedex\/rank\// },
  { name: "Milestones", match: /\/pokedex\/milestones\// },
  { name: "Swap states", match: /swap|trade|exchange/ },
  { name: "Feed derivation", match: /feed/ },
];

function readTree(root, dir, ok) {
  const out = {};
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (!e.isDirectory()) {
        if (ok(p)) out[`/${path.relative(root, p)}`] = fs.readFileSync(p, "utf8");
      } else if (e.name !== "node_modules" && e.name !== "dist") walk(p);
    }
  };
  walk(dir);
  return out;
}

export function render({ rows, missing }, areas) {
  const table = (head, body) => [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...body,
  ];
  const out = [
    "## Story-to-test report (US-QS-02, US-QG-04)",
    "",
    "### Done or in progress, tests naming the ID",
    "",
  ];
  out.push(
    ...table(
      ["ID", "Status", "Tests"],
      rows.map((r) => `| ${r.id} | ${r.status} | ${r.tests} |`),
    ),
  );
  out.push(
    "",
    `Done (✅) without a test naming the ID: ${missing.length ? missing.map((m) => m.id).join(", ") : "none"}`,
  );
  out.push("", "### Pure-logic areas in core (criterion 1)", "");
  out.push(
    ...table(
      ["Area", "Source files", "Test files", "Test cases", "Cases naming an ID", "State"],
      areas.map(
        (a) =>
          `| ${a.name} | ${a.sources.length} | ${a.tests} | ${a.cases} | ${a.named} | ${a.sources.length ? (a.cases ? "exists" : "no tests") : "not yet"} |`,
      ),
    ),
  );
  return out.join("\n");
}

export function run(root) {
  const specs = readTree(root, path.join(root, "Docs/PRODUCT-SPECS"), (p) => p.endsWith(".md"));
  const isTest = (p) => /\.test\.(ts|tsx|mjs)$/.test(p);
  const tests = {};
  for (const d of ["app/packages", "app/tools", ".claude/hooks"])
    Object.assign(tests, readTree(root, path.join(root, d), isTest));
  const core = readTree(root, path.join(root, "app/packages/core/src"), (p) => p.endsWith(".ts"));
  const coreFiles = Object.fromEntries(
    Object.entries(core).map(([p, t]) => [p.replace("/app/packages/core/src", ""), t]),
  );
  const stories = storyRows(parseStatuses(specs), countByStoryId(tests));
  return render(stories, areaRows(AREAS, coreFiles));
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(run(fileURLToPath(new URL("../../../../../..", import.meta.url))));

// Medians of the traced runs (issue 2299): main-thread time by category inside the click interaction and the first second of a start.
import { analyze } from "./analyze-trace.mjs";
import { stats } from "../measure/cdp.mjs";
const label = process.argv[2] ?? "prod-dark-trace";
const keys = [
  "windowMs",
  "script",
  "gc",
  "styleLayout",
  "paintComposite",
  "inputHandling",
  "taskOverhead",
  "other",
  "idle",
];
console.log(`| Interaction | ${keys.join(" | ")} |`);
for (const n of ["plant-layer", "view-switch", "page-next", "news-layer", "watering-done"]) {
  const a = [1, 2, 3].map((r) =>
    analyze(`${process.env.PERF_OUT ?? "results"}/traces/${label}-${n}-${r}.json`, 0, {
      anchor: "click",
    }),
  );
  const m = (k) => {
    const s = stats(a.map((x) => x[k] ?? 0));
    return `${s.median.toFixed(0)} (${s.min.toFixed(0)}–${s.max.toFixed(0)})`;
  };
  console.log(`| ${n} | ${keys.map(m).join(" | ")} |`);
}
const sk = [
  "busy",
  "script",
  "parseCompile",
  "gc",
  "styleLayout",
  "paintComposite",
  "taskOverhead",
  "other",
  "idle",
];
console.log(`\n| Start (first 1000 ms) | ${sk.join(" | ")} |`);
for (const n of ["today", "collection", "news"])
  for (const k of ["cold", "warm"]) {
    const a = [1, 2].map((r) =>
      analyze(
        `${process.env.PERF_OUT ?? "results"}/traces/${label}-start-${n}-${k}-${r}.json`,
        1000,
        {},
      ),
    );
    console.log(
      `| ${n} ${k} | ${sk.map((x) => a.map((y) => (y[x] ?? 0).toFixed(0)).join(" / ")).join(" | ")} |`,
    );
  }

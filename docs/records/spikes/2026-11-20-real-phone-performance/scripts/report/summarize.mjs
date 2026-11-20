// Tables (Markdown) from results/<label>.json, issue 2299. Warm-up runs (rep 0) are excluded from medians.
// usage: node summarize.mjs <label> [<label> ...]
import fs from "node:fs";
import { stats } from "../measure/cdp.mjs";

const f = (x, d = 0) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(d));
const cell = (xs, d = 0) => {
  const s = stats(xs);
  return s.n ? `${f(s.median, d)} (${f(s.min, d)}–${f(s.max, d)})` : "–";
};

function interactionRow(r) {
  // Breakdown from the longest entry of the interaction (the click), as web-vitals does.
  const evs = r.raw.events.filter((e) => e.id === r.raw.events[0]?.id);
  const L = evs.reduce((a, b) => (b.dur > a.dur ? b : a), evs[0]);
  return {
    inp: L?.dur,
    inputDelay: L ? L.ps - L.start : null,
    processing: L ? L.pe - L.ps : null,
    presentation: L ? L.start + L.dur - L.pe : null,
    pointerdown: evs.find((e) => e.name === "pointerdown")?.dur,
  };
}

for (const label of process.argv.slice(2)) {
  const { meta, results } = JSON.parse(
    fs.readFileSync(`${process.env.PERF_OUT ?? "results"}/${label}.json`, "utf8"),
  );
  console.log(
    `\n### ${label} (${meta.scheme}, ${meta.startedAt} to ${meta.endedAt}, load ${meta.loadStart} → ${meta.loadEnd})\n`,
  );
  const runs = results.filter((r) => !r.warmup);
  const names = [...new Set(runs.map((r) => r.name))];
  if (meta.mode === "interactions") {
    console.log(
      "| Interaction | n | INP-equivalent ms | input delay | processing | presentation delay | to final state ms | fetches | React commits to final state | React render ms to final state (profiling) | largest commit ms | warm-up (first use) INP |",
    );
    console.log("| --- | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: |");
    for (const n of names) {
      const rs = runs.filter((r) => r.name === n);
      const b = rs.map(interactionRow);
      const w = results.find((r) => r.name === n && r.warmup);
      console.log(
        `| ${n} | ${rs.length} | ${cell(b.map((x) => x.inp))} | ${cell(b.map((x) => x.inputDelay))} | ${cell(b.map((x) => x.processing))} | ${cell(b.map((x) => x.presentation))} | ${cell(rs.map((r) => r.settleMs))} | ${cell(rs.map((r) => r.fetches))} | ${cell(rs.map((r) => r.commitsToSettle))} | ${cell(
          rs.map((r) => r.actualToSettle),
          1,
        )} | ${cell(
          rs.map((r) => r.maxCommitActual),
          1,
        )} | ${w ? f(interactionRow(w).inp) : "–"} |`,
      );
    }
    const lo = runs.reduce((s, r) => s + (r.loafCount || 0), 0);
    console.log(
      `\nLong animation frames (≥ 50 ms) overlapping an interaction: ${lo} in ${runs.length} runs. Load per run (1 min): ${[...new Set(runs.map((r) => r.loadBefore.split(" ")[1]))].join(", ")}`,
    );
  } else {
    for (const cold of [true, false]) {
      console.log(
        `\n${cold ? "Cold (HTTP cache disabled, service worker bypassed)" : "Warm (HTTP cache and service worker)"}\n`,
      );
      console.log(
        "| Route | n | TTFB | FCP | LCP | LCP element | data ready | TTI estimate | long tasks (ms) | JS files | JS transferred kB | JS decoded kB | API fetches | React commits to data ready | React render ms to data ready |",
      );
      console.log("| --- | -: | -: | -: | -: | --- | -: | -: | -: | -: | -: | -: | -: | -: | -: |");
      for (const n of names) {
        const rs = runs.filter((r) => r.name === n && r.cold === cold);
        if (!rs.length) continue;
        const el = [...new Set(rs.map((r) => r.lcpEl))].join(" / ");
        console.log(
          `| ${n} | ${rs.length} | ${cell(rs.map((r) => r.ttfb))} | ${cell(rs.map((r) => r.fcp))} | ${cell(rs.map((r) => r.lcp))} | ${el} | ${cell(rs.map((r) => r.dataReady))} | ${cell(rs.map((r) => r.tti))} | ${cell(rs.map((r) => r.longTaskMs))} | ${cell(rs.map((r) => r.jsFiles))} | ${cell(
            rs.map((r) => r.jsTransfer / 1000),
            1,
          )} | ${cell(
            rs.map((r) => r.jsDecoded / 1000),
            1,
          )} | ${cell(rs.map((r) => r.fetches))} | ${cell(rs.map((r) => r.commits))} | ${cell(
            rs.map((r) => r.actualToReady),
            1,
          )} |`,
        );
      }
    }
    console.log(
      `\nLoad per run (1 min): ${runs.map((r) => r.loadBefore.split(" ")[1]).join(", ")}`,
    );
  }
}

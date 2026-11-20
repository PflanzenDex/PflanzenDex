// usage: node timeline.mjs <trace.json>
// Top-level main-thread tasks inside the click interaction of a trace, relative to the click start (issue 2299).
import fs from "node:fs";
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const ev = raw.traceEvents ?? raw;
const mark = ev.find((e) => e.name === "pdx-tap");
const pid = mark.pid;
const tid = ev.find(
  (e) =>
    e.ph === "M" && e.name === "thread_name" && e.pid === pid && e.args.name === "CrRendererMain",
).tid;
const click = ev.find(
  (e) =>
    e.name === "EventTiming" &&
    e.pid === pid &&
    e.ph === "b" &&
    e.ts >= mark.ts &&
    e.args?.data?.type === "click",
);
const pd = ev.find(
  (e) =>
    e.name === "EventTiming" &&
    e.pid === pid &&
    e.ph === "b" &&
    e.ts >= mark.ts &&
    e.args?.data?.type === "pointerdown",
);
const t0 = click.ts,
  t1 = click.ts + click.args.data.duration * 1000;
console.log(
  "pointerdown at",
  ((pd.ts - t0) / 1000).toFixed(1),
  "click dur",
  click.args.data.duration.toFixed(1),
);
const top = ev
  .filter(
    (e) =>
      e.pid === pid &&
      e.tid === tid &&
      e.ph === "X" &&
      /^(ThreadControllerImpl::RunTask|RunTask)$/.test(e.name) &&
      e.ts < t1 + 20000 &&
      e.ts + e.dur > t0 - 5000,
  )
  .sort((a, b) => a.ts - b.ts);
for (const t of top) {
  const kids = ev
    .filter(
      (e) =>
        e.pid === pid &&
        e.tid === tid &&
        e.ph === "X" &&
        e.ts >= t.ts &&
        e.ts + e.dur <= t.ts + t.dur &&
        e !== t &&
        e.dur > 1000,
    )
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 4)
    .map(
      (k) =>
        `${k.name}${k.args?.data?.type ? "(" + k.args.data.type + ")" : ""}${k.args?.data?.functionName ? "(" + k.args.data.functionName + ")" : ""}:${(k.dur / 1000).toFixed(1)}`,
    );
  if (t.dur > 1000)
    console.log(
      ((t.ts - t0) / 1000).toFixed(1).padStart(7),
      (t.dur / 1000).toFixed(1).padStart(6),
      kids.join(" "),
    );
}
// frames presented
const frames = ev.filter(
  (e) =>
    /^(PipelineReporter|Graphics.Pipeline|DrawFrame|Display::FrameDisplayed|BeginFrame)$/.test(
      e.name,
    ) &&
    e.ts > t0 - 5000 &&
    e.ts < t1 + 20000,
);
const byName = {};
for (const f of frames) (byName[f.name] ??= []).push(((f.ts - t0) / 1000).toFixed(0));
for (const [k, v] of Object.entries(byName)) console.log(k, v.slice(0, 20).join(" "));

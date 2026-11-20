// Main-thread self time by category inside a window of a Chrome trace (issue 2299).
// usage: node analyze-trace.mjs <trace.json> <windowMs from the pdx-tap mark, or "nav"> [--top]
import fs from "node:fs";

export function analyze(file, windowMs, opts = {}) {
  windowMs = Number(windowMs);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const ev = Array.isArray(raw) ? raw : raw.traceEvents;
  const names = ev.filter((e) => e.ph === "M" && e.name === "thread_name");
  const mark = ev.find((e) => e.name === "pdx-tap");
  let pid, tid, t0;
  if (mark) {
    pid = mark.pid;
    t0 = mark.ts;
    if (opts.anchor === "click") {
      const click = ev.find(
        (e) =>
          e.name === "EventTiming" &&
          e.pid === pid &&
          e.ph === "b" &&
          e.ts >= mark.ts &&
          e.args?.data?.type === "click",
      );
      if (click) {
        t0 = click.ts;
        windowMs = click.args.data.duration;
      }
    }
  } else {
    // navigation: the renderer with the navigationStart of the measured page
    const nav = ev.filter(
      (e) =>
        e.name === "navigationStart" &&
        e.args?.data?.documentLoaderURL?.startsWith("http://localhost:56508"),
    );
    const n = nav[nav.length - 1];
    pid = n.pid;
    t0 = n.ts;
  }
  tid = names.find((n) => n.pid === pid && n.args.name === "CrRendererMain")?.tid;
  const t1 = t0 + windowMs * 1000;
  const main = ev.filter(
    (e) =>
      e.pid === pid &&
      e.tid === tid &&
      e.ph === "X" &&
      e.dur != null &&
      e.ts < t1 &&
      e.ts + e.dur > t0,
  );
  main.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  // self time: subtract direct children (events are properly nested on one thread)
  const stack = [];
  const self = new Map();
  const clip = (e) => Math.max(0, Math.min(e.ts + e.dur, t1) - Math.max(e.ts, t0));
  for (const e of main) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts)
      stack.pop();
    const parent = stack[stack.length - 1];
    const c = clip(e);
    self.set(e, (self.get(e) ?? 0) + c);
    if (parent) self.set(parent, (self.get(parent) ?? 0) - c);
    stack.push(e);
  }
  const cat = (n) => {
    if (
      /^(Document::UpdateStyleAndLayout|Blink\.ForcedStyleAndLayout.*|LocalFrameView::performLayout|LocalFrameView::UpdateStyleAndLayout|Document::recalcStyle|Blink\.StyleAndLayout.*|Blink\.Style.*|Blink\.Layout.*|StyleEngine::.*|Document::UpdateStyle|LayoutView::.*)$/.test(
        n,
      )
    )
      return "styleLayout";
    if (
      /^(Blink\.Paint.*|Blink\.PrePaint.*|Blink\.CompositingInputs.*|Blink\.Compositing.*|PaintArtifactCompositor::Update|LayerTreeHost::WaitForCommitCompletion|LocalFrameView::.*Paint.*|Blink\.UpdateLifecycle.*|LocalFrameView::RunPaintLifecyclePhase|ProxyMain::.*|LayerTreeHost::.*)$/.test(
        n,
      )
    )
      return "paintComposite";
    if (
      /^(WebFrameWidgetImpl::HandleInputEvent|EventHandler::.*|LatencyInfo\.Flow|InputHandlerProxy::.*|WidgetInputHandlerImpl.*|MainThreadEventQueue::.*)$/.test(
        n,
      )
    )
      return "inputHandling";
    if (
      /^(UpdateLayoutTree|Layout|RecalculateStyles|ParseAuthorStyleSheet|ScheduleStyleRecalculation|InvalidateLayout|HitTest|IntersectionObserverController::computeIntersections|UpdateLayerTree)$/.test(
        n,
      )
    )
      return "styleLayout";
    if (
      /^(Paint|PrePaint|Layerize|UpdateLayer|CompositeLayers|Commit|PaintImage|Decode.*|ImageDecodeTask|RasterTask|BeginMainThreadFrame|BeginFrame|UpdateLayers|PaintArtifactCompositor.*|LocalFrameView::RunPostLifecycleSteps|ProxyMain::BeginMainFrame::commit|LayerTreeHost::UpdateLayers)$/.test(
        n,
      )
    )
      return "paintComposite";
    if (
      /^(ParseHTML|ResourceSendRequest|ResourceReceiveResponse|ResourceFinish|ResourceReceivedData|XHRLoad|XHRReadyStateChange)$/.test(
        n,
      )
    )
      return "htmlNetworkCallbacks";
    if (/^(MinorGC|MajorGC|V8\.GC.*|BlinkGC.*|ThreadState::.*|V8.GC_.*)$/.test(n) || /GC/.test(n))
      return "gc";
    if (
      /^(v8\.compile|V8\.CompileCode|v8\.compileModule|V8\.ParseFunctions|v8\.parseOnBackground|V8\.CompileLazy.*|CacheScript|v8\.produceCache|v8\.produceModuleCache|V8.CompileScript)$/i.test(
        n,
      ) ||
      /compile|parse/i.test(n)
    )
      return "parseCompile";
    if (
      /^(FunctionCall|EvaluateScript|v8\.evaluateModule|RunMicrotasks|v8\.run|V8\.Execute|EventDispatch|TimerFire|FireAnimationFrame|FireIdleCallback|v8\.callFunction|v8\.callModuleMethodAsync|V8\.RunMicrotasks|ScheduledAction::execute|MessagePort.*|EventTiming)$/i.test(
        n,
      )
    )
      return "script";
    if (
      /^(ThreadControllerImpl::RunTask|RunTask|SequenceManager.*|ThreadController::.*|TaskAnnotator.*)$/.test(
        n,
      )
    )
      return "taskOverhead";
    return "other";
  };
  const by = {};
  const byName = {};
  for (const [e, s] of self) {
    if (s <= 0) continue;
    const k = cat(e.name);
    by[k] = (by[k] ?? 0) + s / 1000;
    byName[e.name] = (byName[e.name] ?? 0) + s / 1000;
  }
  const busy = Object.values(by).reduce((a, b) => a + b, 0);
  const et = [
    ...new Set(
      ev
        .filter(
          (e) =>
            e.name === "EventTiming" &&
            e.pid === pid &&
            e.ts >= (mark ? mark.ts : t0) &&
            e.ph === "b" &&
            /^(pointerdown|pointerup|click)$/.test(e.args?.data?.type),
        )
        .map((e) => `${e.args.data.type}:${round(e.args.data.duration)}`),
    ),
  ];
  const out = {
    windowMs,
    busy: round(busy),
    idle: round(windowMs - busy),
    ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, round(v)])),
  };
  if (opts.top)
    out.otherNames = Object.entries(byName)
      .filter(([n]) => cat(n) === "other")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([n, v]) => `${n}:${round(v)}`);
  if (opts.top)
    out.top = Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([n, v]) => `${n}:${round(v)}`);
  out.eventTiming = et;
  return out;
}
const round = (x) => Math.round(x * 10) / 10;

if (process.argv[1]?.endsWith("analyze-trace.mjs")) {
  const [f, w, top] = process.argv.slice(2);
  console.log(
    JSON.stringify(
      analyze(f, w === "click" ? 0 : Number(w), {
        top: top === "--top",
        anchor: w === "click" ? "click" : null,
      }),
      null,
      1,
    ),
  );
}

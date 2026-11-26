// Injected before every document (Page.addScriptToEvaluateOnNewDocument), issue 2299.
// 1. Event Timing and Long Animation Frame buffers, 2. a React DevTools hook that records commits,
// 3. a rAF-based waiter. web-vitals (attribution IIFE) is injected next to this file.
(() => {
  const P = (window.__perf = {
    events: [],
    loafs: [],
    commits: [],
    lcp: [],
    longtasks: [],
    marks: {},
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        P.events.push({
          name: e.name,
          id: e.interactionId,
          start: e.startTime,
          dur: e.duration,
          ps: e.processingStart,
          pe: e.processingEnd,
          target: e.target
            ? (e.target.getAttribute("aria-label") || e.target.textContent || e.target.tagName)
                .trim()
                .slice(0, 40)
            : null,
        });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        P.loafs.push({
          start: e.startTime,
          dur: e.duration,
          renderStart: e.renderStart,
          styleAndLayoutStart: e.styleAndLayoutStart,
          blocking: e.blockingDuration,
          scripts: e.scripts.map((s) => ({
            dur: s.duration,
            start: s.startTime,
            exec: s.executionStart,
            forced: s.forcedStyleAndLayoutDuration,
            inv: s.invoker,
            type: s.invokerType,
            src: (s.sourceURL || "").split("/").pop(),
            fn: s.sourceFunctionName,
          })),
        });
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.longtasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        P.lcp.push({
          t: e.startTime,
          size: e.size,
          el: e.element
            ? e.element.tagName + "." + (e.element.className || "").toString().slice(0, 40)
            : null,
          text: e.element ? (e.element.textContent || "").trim().slice(0, 40) : null,
        });
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}

  // React DevTools global hook: React calls onCommitFiberRoot on every commit, also in production builds.
  // In the react-dom/profiling build the HostRoot fiber carries actualDuration (render time of the committed tree).
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = nextId++;
      this.renderers.set(id, renderer);
      P.reactVersion = renderer.version;
      P.bundleType = renderer.bundleType;
      return id;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const cur = root.current;
      const hasTimes = typeof cur.actualDuration === "number";
      P.commits.push({
        t: performance.now(),
        actual: hasTimes ? cur.actualDuration : null,
        base: hasTimes ? cur.treeBaseDuration : null,
      });
    },
    onPostCommitFiberRoot() {},
    onCommitFiberUnmount() {},
  };

  P.waitFor = (fnSrc, timeout = 15000) =>
    new Promise((resolve) => {
      const fn = new Function(`return (${fnSrc});`);
      const t0 = performance.now();
      const tick = () => {
        let ok = false;
        try {
          ok = !!fn();
        } catch {}
        if (ok) return resolve(performance.now());
        if (performance.now() - t0 > timeout) return resolve(null);
        requestAnimationFrame(tick);
      };
      tick();
    });
})();

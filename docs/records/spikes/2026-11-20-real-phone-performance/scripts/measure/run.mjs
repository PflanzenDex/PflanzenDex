// Runner for issue 2299: interactions (INP + breakdown + React commits) and cold/warm starts on the phone over raw CDP.
// usage: node run.mjs <label> <mode: interactions|starts> <reps> [only=<name,...>]
// Needs: tab.json next to this file ({"webSocketDebuggerUrl": ...} of the foreground Chrome tab on the phone, after
// adb forward tcp:9222 localabstract:chrome_devtools_remote), WEB_VITALS_IIFE (path of web-vitals 5.3.0
// dist/web-vitals.attribution.iife.js), PERF_OUT (output folder, default ./results), TRACE=1 for Chrome traces.
// The API (56008), the preview server (56508) and Keycloak (18081) are reached over adb reverse; the database
// container name and the seed account test2 are those of the measured worktree.
import { connect, sleep } from "./cdp.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const here = new URL(".", import.meta.url).pathname;
const OUT = process.env.PERF_OUT ?? "results";
const [label, mode, repsArg, onlyArg] = process.argv.slice(2);
const reps = Number(repsArg ?? 5);
const only = onlyArg?.startsWith("only=") ? onlyArg.slice(5).split(",") : null;
const ORIGIN = "http://localhost:56508";
const tab = JSON.parse(fs.readFileSync(here + "tab.json"));
const c = await connect(tab.webSocketDebuggerUrl);
await c.send("Page.enable");
await c.send("Runtime.enable");
await c.send("Network.enable");
// The phone has no Wi-Fi or mobile network (isolated devbox, only USB with adb reverse), so Chrome reports
// navigator.onLine === false and the app shows its offline notice. This emulation (no latency, 1 GB/s: far above the USB link, so no real throttle; 1e10 overflows and stalls every request)
// makes Chrome report online, as for a keeper with a network.
await c.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 0,
  downloadThroughput: 1e9,
  uploadThroughput: 1e9,
  connectionType: "wifi",
});
const instrument = fs.readFileSync(here + "instrument.js", "utf8");
const wv = fs.readFileSync(process.env.WEB_VITALS_IIFE, "utf8");
const boot = `${instrument}\n${wv}\n;(() => { const P = window.__perf; P.wv = {}; const o = { reportAllChanges: true }; webVitals.onINP(m => P.wv.inp = { v: m.value, a: m.attribution && { inputDelay: m.attribution.inputDelay, processing: m.attribution.processingDuration, presentation: m.attribution.presentationDelay, target: m.attribution.interactionTarget } }, { ...o, durationThreshold: 0 }); webVitals.onLCP(m => P.wv.lcp = { v: m.value, el: m.attribution && m.attribution.target, ttfb: m.attribution && m.attribution.timeToFirstByte, loadDelay: m.attribution && m.attribution.resourceLoadDelay, loadDur: m.attribution && m.attribution.resourceLoadDuration, renderDelay: m.attribution && m.attribution.elementRenderDelay }, o); webVitals.onFCP(m => P.wv.fcp = m.value, o); webVitals.onTTFB(m => P.wv.ttfb = m.value, o); })();`;
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: boot });

const dbg = (...a) =>
  process.env.DEBUG && console.error(new Date().toISOString().slice(11, 23), ...a);
const loadavg = () => execFileSync("sysctl", ["-n", "vm.loadavg"]).toString().trim();
const psql = (sql) =>
  execFileSync("docker", [
    "exec",
    "pflanzendex-test-db-54508",
    "psql",
    "-U",
    "postgres",
    "-d",
    "pflanzendex_test",
    "-Atc",
    sql,
  ])
    .toString()
    .trim();

async function evalRetry(expr, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      return await c.eval(expr);
    } catch {
      await sleep(100);
    }
  }
  throw new Error("evalRetry failed: " + expr);
}
async function navigate(url, settle) {
  await c.send("Page.navigate", { url });
  await sleep(300);
  await evalRetry("!!window.__perf");
  if (await ensureSignedIn()) return navigate(url, settle);
  const t = await evalRetry(`window.__perf.waitFor(${JSON.stringify(settle)}, 20000)`);
  if (t == null) throw new Error("settle timeout after navigate " + url);
  return t;
}
const q = (s) => JSON.stringify(s);
const mainBtn = (re) =>
  `[...document.querySelectorAll('main button, main a')].find(b => ${re}.test(b.textContent) && b.getBoundingClientRect().height > 0)`;
const dlgBtn = (re) =>
  `[...(document.querySelector('[role=dialog]')||document).querySelectorAll('button, a')].find(b => ${re}.test(b.getAttribute('aria-label') || b.textContent) && b.getBoundingClientRect().height > 0)`;
const SETTLE_TODAY = `[...document.querySelectorAll('main a, main button')].some(b => /Gießen/.test(b.textContent))`;
const SETTLE_COLL = `/Seite \\d+ von/.test(document.querySelector('main')?.textContent || '') && [...document.querySelectorAll('main button')].some(b => /Zone|Lichtzone/.test(b.textContent) && !/Lichtzonen/.test(b.textContent))`;
const noDialog = `!document.querySelector('[role=dialog]')`;
const WATER_T0 = "2026-11-19 23:43:00+00";

// Each interaction: prepare (bring to start state), target (element expr), settle (predicate after tap), reset.
const INTERACTIONS = {
  "plant-layer": {
    prepare: async () => ensure(`${ORIGIN}/collection`, SETTLE_COLL + " && " + noDialog),
    target: mainBtn(/Birkenfeige/),
    settle: `!!document.querySelector('[role=dialog]') && [...document.querySelectorAll('[role=dialog] button')].some(b => /^Messen/.test(b.getAttribute('aria-label')||''))`,
    reset: async () => {
      await c.eval("history.back()");
      await evalRetry(`window.__perf.waitFor(${q(noDialog)}, 5000)`);
    },
  },
  "view-switch": {
    prepare: async () => ensure(`${ORIGIN}/collection`, SETTLE_COLL + " && " + noDialog),
    target: mainBtn(/^Arten/),
    settle: `/view=species/.test(location.search) && [...document.querySelectorAll('main button')].length > 6 && !/Pflanze anlegen/.test(document.querySelector('main').textContent)`,
    reset: async () => {
      const p = await c.center(mainBtn(/^Pflanzen$/));
      await c.tap(p.x, p.y);
      await evalRetry(`window.__perf.waitFor(${q(SETTLE_COLL)}, 8000)`);
    },
  },
  "page-next": {
    prepare: async () => ensure(`${ORIGIN}/collection`, SETTLE_COLL + " && " + noDialog),
    target: mainBtn(/^Weiter$/),
    settle: `/Seite 2 von/.test(document.querySelector('main').textContent)`,
    reset: async () => {
      const p = await c.center(mainBtn(/^Zurück$/));
      await c.tap(p.x, p.y);
      await evalRetry(
        `window.__perf.waitFor(${q("/Seite 1 von/.test(document.querySelector('main').textContent)")}, 8000)`,
      );
    },
  },
  "news-layer": {
    prepare: async () => ensure(`${ORIGIN}/today`, SETTLE_TODAY + " && " + noDialog),
    target: mainBtn(/Neu bei Freunden/),
    settle: `!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').querySelectorAll('button, a').length > 3`,
    reset: async () => {
      await c.eval("history.back()");
      await evalRetry(`window.__perf.waitFor(${q(noDialog)}, 5000)`);
    },
  },
  "watering-done": {
    prepare: async () => {
      psql(`delete from watering_log where created_at > '${WATER_T0}'`);
      // a fresh load: the deleted rows must not linger in the client cache
      await navigate(
        `${ORIGIN}/today?sheet=watering`,
        `!!document.querySelector('[role=dialog]') && [...document.querySelectorAll('[role=dialog] button')].some(b => /als gegossen eintragen/.test(b.getAttribute('aria-label')||''))`,
      );
      await sleep(3000);
    },
    target: dlgBtn(/^Echte Aloe – Zweite als gegossen eintragen/),
    settle: `![...document.querySelectorAll('[role=dialog] button')].some(b => /^Echte Aloe – Zweite als gegossen eintragen/.test(b.getAttribute('aria-label')||''))`,
    reset: async () => {},
  },
};

// The Keycloak session of the dev realm ends after idling; sign in again through the real sign-in page when needed.
async function ensureSignedIn() {
  const state = async () =>
    c
      .eval(
        `(() => { if ([...document.querySelectorAll('button,a')].some(b => /^Anmelden$/.test(b.textContent.trim()))) return 'out'; if (document.querySelector('nav a')) return 'in'; return 'unknown'; })()`,
      )
      .catch(() => "unknown");
  let s = "unknown";
  for (let i = 0; i < 50 && s === "unknown"; i++) {
    await sleep(200);
    s = await state();
  }
  if (s !== "out") return false;
  dbg("signing in");
  const p = await c.center(
    `[...document.querySelectorAll('button,a')].find(b => /^Anmelden$/.test(b.textContent.trim()))`,
  );
  await c.tap(p.x, p.y);
  const form = await c.waitFor(
    `document.querySelector('#username') ? 'form' : (location.origin === ${q(ORIGIN)} && document.querySelector('nav a') ? 'sso' : '')`,
    30000,
  );
  dbg("sign-in path", form);
  if (form === "form")
    await c.eval(
      `(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('#username'),'test2'); set(document.querySelector('#password'),'testtest12'); document.querySelector('#kc-login').click(); return 1; })()`,
    );
  await c.waitFor(`location.origin === ${q(ORIGIN)} && !!document.querySelector('nav a')`, 30000);
  await sleep(3000);
  return true;
}

// Start state: reuse the page when it already shows it (no reload between runs of one interaction), else navigate.
async function ensure(url, settle) {
  const ok = await c
    .eval(
      `(() => { try { return !!window.__perf && location.pathname === new URL(${q(url)}).pathname && !/sheet=/.test(location.search) && !!(${settle}); } catch { return false; } })()`,
    )
    .catch(() => false);
  if (!ok) {
    await navigate(url, settle);
    await sleep(3000);
  }
}

async function runInteraction(name, def, rep) {
  await def.prepare();
  await sleep(1500);
  const before = loadavg();
  const t0 = await c.eval("performance.now()");
  const p = await c.center(def.target);
  if (!p) throw new Error(`${name}: target not found`);
  await sleep(500); // scrollIntoView settles
  await traceStart();
  const tTap = await c.eval("performance.mark('pdx-tap'), performance.now()");
  await c.tap(p.x, p.y);
  const tSettle = await evalRetry(`window.__perf.waitFor(${q(def.settle)}, 15000)`);
  await sleep(1500); // trailing event timing and LoAF entries
  await traceEnd(`${label}-${name}-${rep}`);
  const data = await c.eval(`(() => { const P = window.__perf; const t0 = ${tTap};
    return { events: P.events.filter(e => e.start >= t0 - 5 && e.id > 0), loafs: P.loafs.filter(l => l.start + l.dur >= t0), commits: P.commits.filter(x => x.t >= t0),
      res: performance.getEntriesByType('resource').filter(r => r.startTime >= t0).map(r => ({ n: r.name.replace(location.origin,'').slice(0,80), type: r.initiatorType, s: r.startTime, e: r.responseEnd, tx: r.transferSize })),
      bundleType: P.bundleType, reactVersion: P.reactVersion, wvInp: P.wv.inp }; })()`);
  const r = summarizeInteraction(name, rep, tTap, tSettle, data);
  r.loadBefore = before;
  r.loadAfter = loadavg();
  await def.reset();
  return { ...r, raw: data };
}

function summarizeInteraction(name, rep, tTap, tSettle, d) {
  const ids = [...new Set(d.events.map((e) => e.id))];
  const first = ids[0];
  const evs = d.events.filter((e) => e.id === first);
  const longest = evs.reduce((a, b) => (b.dur > a.dur ? b : a), evs[0] ?? null);
  const out = {
    name,
    rep,
    settleMs: tSettle == null ? null : tSettle - tTap,
    interactions: ids.length,
  };
  if (longest) {
    const ps = Math.min(...evs.map((e) => e.ps));
    const pe = Math.max(...evs.map((e) => e.pe));
    const start = Math.min(...evs.map((e) => e.start));
    const end = start + longest.dur;
    out.inp = longest.dur;
    out.inputDelay = ps - start;
    out.processing = pe - ps;
    out.presentation = end - pe;
    out.events = evs.map((e) => e.name).join(",");
    // LoAFs overlapping the interaction (start .. next paint)
    const lo = d.loafs.filter((l) => l.start < end && l.start + l.dur > start);
    out.loafCount = lo.length;
    out.loafScript = lo.reduce((s, l) => s + l.scripts.reduce((a, x) => a + x.dur, 0), 0);
    out.loafStyleLayout = lo.reduce(
      (s, l) => s + (l.styleAndLayoutStart ? l.start + l.dur - l.styleAndLayoutStart : 0),
      0,
    );
    out.loafForced = lo.reduce((s, l) => s + l.scripts.reduce((a, x) => a + (x.forced || 0), 0), 0);
    out.loafDur = lo.reduce((s, l) => s + l.dur, 0);
    out.commitsInFrame = d.commits.filter((x) => x.t <= end).length;
    out.actualInFrame = sumActual(d.commits.filter((x) => x.t <= end));
  }
  const settleAbs = tSettle ?? tTap;
  const cs = d.commits.filter((x) => x.t <= settleAbs + 300);
  out.commitsToSettle = cs.length;
  out.actualToSettle = sumActual(cs);
  out.maxCommitActual =
    cs.reduce((m, x) => (x.actual != null && x.actual > m ? x.actual : m), 0) || null;
  // all LoAFs between tap and settle: script vs style/layout on the main thread until the final state
  const lo2 = d.loafs.filter((l) => l.start + l.dur > tTap && l.start < settleAbs);
  out.settleLoafScript = lo2.reduce((s, l) => s + l.scripts.reduce((a, x) => a + x.dur, 0), 0);
  out.settleLoafStyleLayout = lo2.reduce(
    (s, l) => s + (l.styleAndLayoutStart ? l.start + l.dur - l.styleAndLayoutStart : 0),
    0,
  );
  const fetches = d.res.filter((r) => r.type === "fetch" || r.type === "xmlhttprequest");
  out.fetches = fetches.length;
  out.fetchEnd = fetches.length ? Math.max(...fetches.map((r) => r.e)) - tTap : 0;
  out.scripts = d.res
    .filter((r) => r.type === "script" || /\.js$/.test(r.n))
    .map((r) => r.n)
    .join(" ");
  out.bundleType = d.bundleType;
  return out;
}
const sumActual = (cs) =>
  cs.some((x) => x.actual != null) ? cs.reduce((s, x) => s + (x.actual ?? 0), 0) : null;

const STARTS = {
  today: { url: `${ORIGIN}/today`, settle: SETTLE_TODAY },
  collection: { url: `${ORIGIN}/collection`, settle: SETTLE_COLL },
  news: {
    url: `${ORIGIN}/today?sheet=news`,
    settle: `!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').querySelectorAll('button, a').length > 3`,
  },
};

async function runStart(name, def, rep, cold) {
  await c.send("Network.setCacheDisabled", { cacheDisabled: false });
  await c.send("Network.setBypassServiceWorker", { bypass: false });
  await navigate(`${ORIGIN}/today`, SETTLE_TODAY); // not measured: makes sure the session is alive
  await c.send("Page.navigate", { url: "about:blank" });
  await sleep(1000);
  await c.send("Network.setCacheDisabled", { cacheDisabled: cold });
  await c.send("Network.setBypassServiceWorker", { bypass: cold });
  await sleep(500);
  const before = loadavg();
  await traceStart();
  dbg("navigate", def.url);
  await c.send("Page.navigate", { url: def.url });
  dbg("navigated");
  await sleep(200);
  await evalRetry("!!window.__perf");
  dbg("perf present");
  const tSettle = await evalRetry(`window.__perf.waitFor(${q(def.settle)}, 25000)`);
  dbg("settled", tSettle);
  await sleep(6500); // quiet window for the TTI estimate and final LCP
  await traceEnd(`${label}-${name}-${cold ? "cold" : "warm"}-${rep}`);
  // LCP is final at the first input; a scroll-free key press is not needed: we read the last candidate.
  const d =
    await c.eval(`(() => { const P = window.__perf; const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, p.startTime]));
    const res = performance.getEntriesByType('resource').map(r => ({ n: r.name.replace(location.origin,'').slice(0,100), type: r.initiatorType, s: r.startTime, e: r.responseEnd, tx: r.transferSize, enc: r.encodedBodySize, dec: r.decodedBodySize }));
    return { nav: { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, tx: nav.transferSize }, paint, lcp: P.lcp, wv: P.wv, longtasks: P.longtasks, loafs: P.loafs.map(l => ({ start: l.start, dur: l.dur, blocking: l.blocking, script: l.scripts.reduce((a,x)=>a+x.dur,0), sl: l.styleAndLayoutStart ? l.start + l.dur - l.styleAndLayoutStart : 0, top: l.scripts.sort((a,b)=>b.dur-a.dur).slice(0,3).map(x => x.src + ':' + (x.fn||x.inv||'').slice(0,40) + ':' + Math.round(x.dur)) })), commits: P.commits, res, now: performance.now() }; })()`);
  const lt = d.longtasks.filter((t) => t.start < d.now);
  // TTI estimate (Lighthouse-like, network quiet not checked): end of the last long task that is followed by >= 5 s
  // without a long task, not earlier than DCL and FCP.
  let tti = Math.max(d.nav.dcl, d.paint["first-contentful-paint"] ?? 0);
  for (const t of lt)
    if (t.start + t.dur > tti && d.now - (t.start + t.dur) >= 0)
      tti = Math.max(tti, t.start + t.dur);
  const quietOk = d.now - tti >= 5000;
  const js = d.res.filter((r) => /\.js(\?|$)/.test(r.n));
  const fetches = d.res.filter((r) => r.type === "fetch" || r.type === "xmlhttprequest");
  const out = {
    name,
    rep,
    cold,
    loadBefore: before,
    ttfb: d.nav.ttfb,
    fcp: d.paint["first-contentful-paint"] ?? null,
    lcp: d.lcp.length ? d.lcp[d.lcp.length - 1].t : null,
    lcpEl: d.lcp.length ? `${d.lcp[d.lcp.length - 1].el} "${d.lcp[d.lcp.length - 1].text}"` : null,
    wvLcp: d.wv.lcp?.v ?? null,
    dataReady: tSettle,
    dcl: d.nav.dcl,
    tti,
    ttiQuietWindowOk: quietOk,
    longTasks: lt.length,
    longTaskMs: lt.reduce((s, t) => s + t.dur, 0),
    tbtApprox: lt
      .filter((t) => t.start > (d.paint["first-contentful-paint"] ?? 0) && t.start < tti)
      .reduce((s, t) => s + Math.max(0, t.dur - 50), 0),
    jsFiles: js.length,
    jsTransfer: js.reduce((s, r) => s + (r.tx || 0), 0),
    jsEncoded: js.reduce((s, r) => s + (r.enc || 0), 0),
    jsDecoded: js.reduce((s, r) => s + (r.dec || 0), 0),
    fetches: fetches.length,
    fetchEnd: fetches.length ? Math.max(...fetches.map((r) => r.e)) : null,
    commits: d.commits.filter((x) => x.t <= tSettle + 300).length,
    commitsTotal: d.commits.length,
    actualToReady: sumActual(d.commits.filter((x) => x.t <= tSettle + 300)),
  };
  return { ...out, raw: d };
}

const TRACE = !!process.env.TRACE;
const CATS = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "v8.execute",
  "v8",
  "blink.user_timing",
  "latencyInfo",
  "toplevel",
  "loading",
  "disabled-by-default-v8.compile",
  "blink",
  "cc",
  "input",
];
async function traceStart() {
  if (!TRACE) return;
  await c.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { includedCategories: CATS, recordMode: "recordAsMuchAsPossible" },
  });
  await sleep(300);
}
async function traceEnd(file) {
  if (!TRACE) return;
  const done = c.once("Tracing.tracingComplete", 120000);
  await c.send("Tracing.end");
  const { stream } = await done;
  let data = "";
  for (;;) {
    const r = await c.send("IO.read", { handle: stream, size: 1 << 20 });
    data += r.base64Encoded ? Buffer.from(r.data, "base64").toString() : r.data;
    if (r.eof) break;
  }
  await c.send("IO.close", { handle: stream });
  fs.mkdirSync(`${OUT}/traces`, { recursive: true });
  fs.writeFileSync(`${OUT}/traces/${file}.json`, data);
}

const results = [];
const outFile = `${OUT}/${label}.json`;
fs.mkdirSync(`${OUT}`, { recursive: true });
const scheme = await c.eval(
  "matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'",
);
const online = await c.eval("navigator.onLine");
if (!online) throw new Error("navigator.onLine is false");
const meta = {
  online,
  label,
  mode,
  reps,
  scheme,
  startedAt: new Date().toISOString(),
  loadStart: loadavg(),
  ua: await c.eval("navigator.userAgent"),
  vp: await c.eval("[innerWidth, innerHeight, devicePixelRatio]"),
};
console.log(JSON.stringify(meta));
psql(`delete from watering_log where created_at > '${WATER_T0}'`); // every series starts with the seeded watering state
try {
  if (mode === "interactions") {
    await c.send("Network.setCacheDisabled", { cacheDisabled: false });
    await c.send("Network.setBypassServiceWorker", { bypass: false });
    // first load of the build in this tab: warm up so lazy chunks of each route are loaded once (a keeper's second use)
    for (const [name, def] of Object.entries(INTERACTIONS)) {
      if (only && !only.includes(name)) continue;
      for (let rep = 0; rep <= reps; rep++) {
        // rep 0 is a warm-up and is reported apart (first use: lazy chunk download)
        const r = await runInteraction(name, def, rep);
        r.warmup = rep === 0;
        results.push(r);
        const { raw, ...s } = r;
        console.log(JSON.stringify(s));
      }
    }
  } else {
    for (const cold of [true, false]) {
      for (const [name, def] of Object.entries(STARTS)) {
        if (only && !only.includes(name)) continue;
        for (let rep = 0; rep <= reps; rep++) {
          if (!cold && rep === 0) {
            // warm series: a first load fills HTTP and worker caches, reported as warm-up
          }
          const r = await runStart(name, def, rep, cold);
          r.warmup = rep === 0;
          results.push(r);
          const { raw, ...s } = r;
          console.log(JSON.stringify(s));
        }
      }
    }
  }
} finally {
  await c.send("Network.setCacheDisabled", { cacheDisabled: false }).catch(() => {});
  await c.send("Network.setBypassServiceWorker", { bypass: false }).catch(() => {});
  meta.endedAt = new Date().toISOString();
  meta.loadEnd = loadavg();
  fs.writeFileSync(outFile, JSON.stringify({ meta, results }, null, 1));
  c.close();
}

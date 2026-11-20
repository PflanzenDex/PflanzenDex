// Minimal raw CDP client for the phone (issue 2299). Node's global WebSocket, no Playwright.
import fs from "node:fs";

export const HOST = "http://localhost:9222";

export async function newTab(url = "about:blank") {
  const b = await connect(`ws://localhost:9222/devtools/browser`);
  const { targetId } = await b.send("Target.createTarget", { url });
  b.close();
  await sleep(500);
  return (await listTabs()).find((t) => t.id === targetId);
}
export async function listTabs() {
  return (await fetch(`${HOST}/json/list`)).json();
}
export async function closeTab(id) {
  await fetch(`${HOST}/json/close/${id}`);
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message} ${msg.error.data ?? ""}`));
      else res(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  const c = {
    ws,
    send(method, params = {}) {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method, params }));
      return new Promise((res, rej) => pending.set(mid, { res, rej }));
    },
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
      return () =>
        listeners.set(
          method,
          listeners.get(method).filter((f) => f !== fn),
        );
    },
    once(method, timeout = 30000) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => {
          off();
          rej(new Error(`timeout waiting for ${method}`));
        }, timeout);
        const off = c.on(method, (p) => {
          clearTimeout(t);
          off();
          res(p);
        });
      });
    },
    async eval(expression, awaitPromise = true) {
      const r = await c.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails)
        throw new Error(`eval: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
      return r.result.value;
    },
    async waitFor(expression, timeout = 20000, step = 100) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try {
          const v = await c.eval(expression);
          if (v) return v;
        } catch {}
        await sleep(step);
      }
      throw new Error(`waitFor timed out: ${expression}`);
    },
    /** Centre of the first element the JS expression returns, in CSS px of the viewport. */
    async center(elExpr) {
      return c.eval(
        `(() => { const el = (${elExpr}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`,
      );
    },
    async tap(x, y) {
      const p = [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }];
      await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: p });
      await sleep(40);
      await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async screenshot(file) {
      const r = await c.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    close() {
      ws.close();
    },
  };
  return c;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function stats(xs) {
  const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const q = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo);
  };
  return {
    n: v.length,
    median: q(0.5),
    min: v[0],
    max: v[v.length - 1],
    p25: q(0.25),
    p75: q(0.75),
  };
}

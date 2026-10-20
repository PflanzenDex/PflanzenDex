import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { clientKey, writeLimit } from "./write-limit";

// TE-03 (#762): write endpoints answer 429 with a stable code after the per-client limit.
const token = (sub: string) =>
  `Bearer h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;

function app(max = 2, clock = { t: 0 }) {
  const a = new Hono();
  a.use(
    "*",
    writeLimit({ max, windowMs: 60_000 }, () => clock.t),
  );
  a.all("/x", (c) => c.json({ ok: true }));
  return a;
}
const send = (a: Hono, method: string, headers: Record<string, string> = {}) =>
  a.request("/x", { method, headers });

describe("TE-03 write limit per client (#762)", () => {
  it("TE-03 after the limit a write answers 429 request.rate_limited with the German text and Retry-After", async () => {
    const clock = { t: 0 };
    const a = app(2, clock);
    const auth = { Authorization: token("user-1") };
    expect((await send(a, "POST", auth)).status).toBe(200);
    expect((await send(a, "DELETE", auth)).status).toBe(200);
    clock.t = 15_000;
    const res = await send(a, "PATCH", auth);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    expect(await res.json()).toEqual({
      error: {
        code: "request.rate_limited",
        text: "Zu viele Änderungen in kurzer Zeit. Warte eine Minute und versuche es dann erneut.",
      },
    });
  });

  it("TE-03 reads, preflights and other clients are not counted", async () => {
    const a = app(1);
    const auth = { Authorization: token("user-1") };
    for (const method of ["GET", "GET", "OPTIONS", "HEAD"])
      expect((await send(a, method, auth)).status).not.toBe(429);
    expect((await send(a, "POST", auth)).status).toBe(200);
    expect((await send(a, "POST", { Authorization: token("user-2") })).status).toBe(200);
    expect((await send(a, "POST", auth)).status).toBe(429);
  });

  it("TE-03 a new window starts after a minute", async () => {
    const clock = { t: 0 };
    const a = app(1, clock);
    expect((await send(a, "POST", { Authorization: token("u") })).status).toBe(200);
    expect((await send(a, "POST", { Authorization: token("u") })).status).toBe(429);
    clock.t = 60_000;
    expect((await send(a, "POST", { Authorization: token("u") })).status).toBe(200);
  });

  it("TE-03 counts by subject, else by the first forwarded address, else one shared counter", () => {
    expect(clientKey(token("abc"), "1.2.3.4")).toBe("sub:abc");
    expect(clientKey(undefined, "1.2.3.4, 172.29.40.2")).toBe("ip:1.2.3.4");
    expect(clientKey("Bearer not-a-jwt", "5.6.7.8")).toBe("ip:5.6.7.8");
    expect(clientKey(`Bearer h.${Buffer.from("{oops").toString("base64url")}.s`, undefined)).toBe(
      "unknown",
    );
    expect(clientKey(undefined, undefined)).toBe("unknown");
  });

  it("TE-03 the server limits writes; in process (tests, demo seed) the app writes unlimited", async () => {
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(main).toMatch(/createApp\(\{[\s\S]*writeLimit: WRITE_LIMIT,[\s\S]*\}\);/);
    const free = createApp();
    for (let i = 0; i < 3; i++)
      expect((await free.request("/x", { method: "POST" })).status).toBe(404);
  });

  it("TE-03 with a limit the app answers 429 after it; the health check stays a read", async () => {
    const a = createApp({ writeLimit: { max: 1, windowMs: 60_000 } });
    expect((await a.request("/x", { method: "POST" })).status).toBe(404);
    expect((await a.request("/x", { method: "POST" })).status).toBe(429);
    for (let i = 0; i < 3; i++) expect((await a.request("/health")).status).toBe(200);
  });
});

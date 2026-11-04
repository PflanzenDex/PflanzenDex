import type { AccountData } from "@pflanzendex/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { describe, expect, it } from "vitest";
import { accountEtag } from "./account-etag";
import type { AuthEnv } from "./auth-env";

// NFR-12 (issue 1244): the answers of the account can be asked again with their ETag; a 304 is only answered to the
// account whose body it describes. The account comes from a header here; the real guard is tested in app.test.ts.
function app(options: { cors?: boolean } = {}) {
  const a = new Hono<AuthEnv>();
  if (options.cors)
    a.use("*", cors({ origin: "http://localhost:5173", allowHeaders: ["Authorization"] }));
  a.use("*", async (c, next) => {
    const id = c.req.header("x-account");
    if (!id) return c.json({ error: { code: "not_signed_in" } }, 401);
    c.set("account", { id, data: {} as AccountData });
    await next();
  });
  a.use("*", accountEtag());
  let items = 0;
  a.get("/list", (c) => c.json({ items: Array.from({ length: items }, (_, i) => i) }));
  a.post("/add", (c) => {
    items += 1;
    return c.json({ items });
  });
  a.get("/missing", (c) => c.json({ error: { code: "x.missing", text: "Fehlt." } }, 404));
  a.get("/photo", (c) =>
    c.body(new Uint8Array([1, 2, 3]), 200, {
      "content-type": "image/png",
      "cache-control": "private, max-age=3600",
    }),
  );
  a.get("/export", (c) => c.json({ data: [] }, 200, { "cache-control": "no-store" }));
  return a;
}

const get = (a: Hono<AuthEnv>, path: string, headers: Record<string, string> = {}) =>
  a.request(path, { headers: { "x-account": "a", ...headers } });

describe("NFR-12 conditional answers of the account", () => {
  it("NFR-12 an answer of the account carries its ETag, the private rule and Vary: Authorization", async () => {
    const res = await get(app(), "/list");
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("vary")).toContain("Authorization");
  });

  it("NFR-12 a repeat with the ETag of unchanged data is answered 304 without a body, with the rule and the vary repeated", async () => {
    const a = app();
    const first = await get(a, "/list");
    const etag = first.headers.get("etag") ?? "";
    const again = await get(a, "/list", { "if-none-match": etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("etag")).toBe(etag);
    expect(again.headers.get("cache-control")).toBe("private, no-cache");
    expect(again.headers.get("vary")).toContain("Authorization");
  });

  it("NFR-12 changed data is answered 200 with a new ETag, so an old ETag never shows stale data", async () => {
    const a = app();
    const etag = (await get(a, "/list")).headers.get("etag") ?? "";
    await a.request("/add", { method: "POST", headers: { "x-account": "a" } });
    const changed = await get(a, "/list", { "if-none-match": etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
    expect(await changed.json()).toEqual({ items: [0] });
  });

  it("NFR-12 another account never gets a 304 for the ETag of the first, even when both bodies are equal", async () => {
    const a = app();
    // Both accounts have an empty list: the bodies are identical, the answers must still differ.
    const ofA = (await get(a, "/list", { "x-account": "a" })).headers.get("etag") ?? "";
    const ofB = await get(a, "/list", { "x-account": "b", "if-none-match": ofA });
    expect(ofB.status).toBe(200);
    expect(await ofB.json()).toEqual({ items: [] });
    expect(ofB.headers.get("etag")).not.toBe(ofA);
    // and the first account still gets its own 304
    expect((await get(a, "/list", { "x-account": "a", "if-none-match": ofA })).status).toBe(304);
  });

  it("NFR-12 errors and writes get no ETag and no rule of their own", async () => {
    const a = app();
    const missing = await get(a, "/missing");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("etag")).toBeNull();
    expect(missing.headers.get("cache-control")).toBeNull();
    const unauthenticated = await a.request("/list");
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("etag")).toBeNull();
    const write = await a.request("/add", { method: "POST", headers: { "x-account": "a" } });
    expect(write.headers.get("etag")).toBeNull();
    expect(write.headers.get("vary")).toBeNull();
  });

  it("NFR-12 an answer with a cache rule of its own keeps it and gets no ETag (photos, exports)", async () => {
    const a = app();
    const photo = await get(a, "/photo");
    expect(photo.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(photo.headers.get("etag")).toBeNull();
    const exported = await get(a, "/export");
    expect(exported.headers.get("cache-control")).toBe("no-store");
    expect(exported.headers.get("etag")).toBeNull();
  });

  it("NFR-12 the CORS headers of the web origin are on a 304 too, so the browser can use the copy", async () => {
    const a = app({ cors: true });
    const etag = (await get(a, "/list")).headers.get("etag") ?? "";
    const again = await a.request("/list", {
      headers: { "x-account": "a", "if-none-match": etag, origin: "http://localhost:5173" },
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
});

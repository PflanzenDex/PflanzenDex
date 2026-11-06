import type { AccountData, IdempotencyStore } from "@pflanzendex/core";
import { defineOperation, ok } from "@pflanzendex/core";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { write, type AuthEnv } from "./kernel";

describe("health endpoint (TE-01, TE-03)", () => {
  it("TE-03 the public /health answers only the status", async () => {
    const app = createApp({ version: "v0.1.0-3-gabc1234", commit: "abc1234" });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("TE-03 /health/details answers with status, product name from core and version", async () => {
    const res = await createApp({ version: "v0.1.0-3-gabc1234", commit: "abc1234" }).request(
      "/health/details",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      product: "PflanzenDex",
      version: "v0.1.0-3-gabc1234",
      commit: "abc1234",
      checks: {
        database: "not_configured",
        jobs: { status: "not_configured" },
        storage: "not_configured",
      },
    });
  });

  it("reports 'unknown' when no version is known (P-08)", async () => {
    const res = await createApp().request("/health/details");
    expect(await res.json()).toMatchObject({ version: "unknown", commit: "unknown" });
  });

  it("reveals no environment variables or secrets", async () => {
    process.env["DATABASE_URL"] = "postgres://nutzer:geheim@db/x";
    for (const path of ["/health", "/health/details"]) {
      const body = await (await createApp().request(path)).text();
      expect(body).not.toContain("geheim");
    }
    delete process.env["DATABASE_URL"];
  });
});

describe("error reports name the running version (US-DEV-06)", () => {
  beforeEach(() => {
    vi.stubEnv("APP_VERSION", "v0.1.0-3-gabc1234");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("US-DEV-06 an unexpected failure of a route is logged with the running version and answers the stable code", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp();
    app.get("/probe/crash", () => {
      throw new Error("secret detail");
    });
    const res = await app.request("/probe/crash");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "system.unexpected" } });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toBe("Request failed (version v0.1.0-3-gabc1234)");
  });

  it("US-DEV-06 an operation that fails unexpectedly is logged with the running version", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crash = defineOperation({
      name: "probe.crash",
      schema: (input) => ok(input as Record<string, never>),
      run: async () => {
        throw new Error("secret detail");
      },
    });
    const idempotency: IdempotencyStore = {
      begin: async () => ({ kind: "fresh" }),
      complete: async () => undefined,
      discard: async () => undefined,
    };
    const app = new Hono<AuthEnv>();
    app.post("/probe/write", (c) => {
      c.set("account", { id: "probe-account", data: {} as AccountData });
      return write(c, { idempotency }, crash, { input: {} });
    });
    const res = await app.request("/probe/write", {
      method: "POST",
      headers: { "Idempotency-Key": "probe-1" },
    });
    expect(res.status).toBe(500);
    expect(errors.mock.calls[0]?.[0]).toBe("Operation failed (version v0.1.0-3-gabc1234)");
  });

  it("US-DEV-06 without a known version the log says unknown (P-08)", async () => {
    vi.stubEnv("APP_VERSION", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp();
    app.get("/probe/crash", () => {
      throw new Error("secret detail");
    });
    await app.request("/probe/crash");
    expect(errors.mock.calls[0]?.[0]).toBe("Request failed (version unknown)");
  });
});

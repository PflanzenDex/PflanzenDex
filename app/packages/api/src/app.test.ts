import { describe, expect, it } from "vitest";
import { createApp } from "./app";

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

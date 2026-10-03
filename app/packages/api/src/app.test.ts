import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("Gesundheits-Endpunkt (TE-01, TE-03)", () => {
  it("antwortet mit Status, Produktname aus core und Version", async () => {
    const res = await createApp({ version: "abc1234" }).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", produkt: "PflanzenDex", version: "abc1234" });
  });

  it("meldet 'unbekannt', wenn keine Version bekannt ist (P-08)", async () => {
    const res = await createApp().request("/health");
    expect(await res.json()).toMatchObject({ version: "unbekannt" });
  });

  it("gibt keine Umgebungsvariablen oder Geheimnisse preis", async () => {
    process.env["DATABASE_URL"] = "postgres://nutzer:geheim@db/x";
    const body = await (await createApp().request("/health")).text();
    expect(body).not.toContain("geheim");
    delete process.env["DATABASE_URL"];
  });
});

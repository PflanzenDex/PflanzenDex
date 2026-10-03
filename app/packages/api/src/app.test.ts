import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("Gesundheits-Endpunkt (Gerüst-Test, TE-01)", () => {
  it("antwortet mit Status und Produktname aus core", async () => {
    const res = await createApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", produkt: "PflanzenDex" });
  });
});

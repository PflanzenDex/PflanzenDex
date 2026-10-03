import { describe, expect, it, vi } from "vitest";
import { erzeugeSchreiben, ladeAbleitung, ladeLicht } from "./licht-api";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-LIC-05 Client der Licht-API", () => {
  it("lädt Zonen, Standorte und Hinweise mit Bearer-Token", async () => {
    const abruf = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/lichtzonen")) return antwort(200, { zonen: [] });
      if (u.endsWith("/standorte")) return antwort(200, { standorte: [] });
      return antwort(200, { hinweise: [] });
    });
    const r = await ladeLicht("http://api", "tok", abruf as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, wert: { zonen: [], standorte: [], hinweise: [] } });
    const kopf = abruf.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe("Bearer tok");
  });

  it("Schreiben sendet je Aufruf einen neuen Idempotency-Key", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(201, { id: "z" }));
    const schreibe = erzeugeSchreiben("http://api", "tok", abruf as unknown as typeof fetch);
    await schreibe("POST", "/lichtzonen", { name: "A" });
    await schreibe("POST", "/lichtzonen", { name: "A" });
    const schluessel = abruf.mock.calls.map(
      (a) =>
        ((a as unknown[])[1] as { headers: Record<string, string> }).headers["Idempotency-Key"],
    );
    expect(schluessel[0]).toBeTruthy();
    expect(schluessel[0]).not.toBe(schluessel[1]);
  });

  it("reicht den Fehler des Servers samt Nutzern der Zone durch", async () => {
    const fehler = {
      code: "lichtzone.in_benutzung",
      text: "Genutzt",
      daten: [{ art: "standort", id: "s", name: "Regal" }],
    };
    const schreibe = erzeugeSchreiben("http://api", "t", (async () =>
      antwort(409, { fehler })) as unknown as typeof fetch);
    expect(await schreibe("DELETE", "/lichtzonen/z")).toEqual({ ok: false, fehler });
  });

  it("ein nicht erreichbarer Server wird verständlich gemeldet, nichts wird halb angezeigt", async () => {
    const abruf = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const r = await ladeLicht("http://api", "t", abruf);
    expect(!r.ok && r.fehler.code).toBe("netz.nicht_erreichbar");
  });
});

describe("US-LIC-01 Ableitung laden", () => {
  it("ruft die Ableitung mit den Angaben der Art ab", async () => {
    const abruf = vi.fn(
      async () => new Response(JSON.stringify({ art: "unbekannt", grund: "kein_bedarf" })),
    );
    const r = await ladeAbleitung(
      "/api",
      "t",
      { lichtbedarfLux: 15000, standardStufe: 2, weichesBlatt: true },
      abruf as unknown as typeof fetch,
    );
    expect(r.ok).toBe(true);
    expect(String((abruf.mock.calls[0] as unknown[])[0])).toBe(
      "/api/lichtzonen/ableitung?lichtbedarfLux=15000&standardStufe=2&weichesBlatt=true",
    );
  });
});

import { renderToString as rendere } from "react-dom/server";
import type { LichtStandort, PhasenZeile } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { PhasenListe } from "./phasen-liste";
import { ladePflegephasen } from "./pflegephasen-api";

const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const standorte: LichtStandort[] = [
  { id: "s1", name: "Regal Süd", lichtzoneId: null, art: "innen" },
];
const zeile = (extra: Partial<PhasenZeile> = {}): PhasenZeile => ({
  exemplarId: "e1",
  name: "Bogenhanf",
  artId: "a1",
  phase: "ruhe",
  standortId: "s1",
  sollStandortId: null,
  ...extra,
});

describe("US-PHA-01 Client der Pflegephasen-API", () => {
  it("US-PHA-01 fragt mit Bearer-Token und der Zeitzone des Geräts", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { phasen: [zeile()] }));
    const r = await ladePflegephasen("http://api", "tok", abruf);
    expect(r).toMatchObject({ ok: true, wert: [{ exemplarId: "e1" }] });
    const [url, init] = abruf.mock.calls[0] ?? [];
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(String(url)).toBe(`http://api/pflegephasen?zeitzone=${encodeURIComponent(zone)}`);
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("US-PHA-01 ein Fehler der API bleibt ein Fehler mit Code", async () => {
    const fehler = { code: "eingabe.ungueltig", text: "Die Eingabe ist ungültig." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(400, { fehler }));
    expect(await ladePflegephasen("http://api", "tok", abruf)).toMatchObject({
      ok: false,
      fehler: { code: "eingabe.ungueltig" },
    });
  });
});

describe("US-PHA-01 Liste der Pflegephasen", () => {
  it("US-PHA-01 zeigt Phase, Standort und unbekannten Soll-Standort je Exemplar (P-08)", () => {
    const h = renderToString(<PhasenListe zeilen={[zeile()]} standorte={standorte} />);
    expect(h).toContain("Bogenhanf");
    expect(h).toContain("Soll-Phase heute: Ruhephase");
    expect(h).toContain("Standort: Regal Süd");
    expect(h).toContain("Soll-Standort: unbekannt");
  });

  it("US-PHA-01 Wachstumsphase wird als solche benannt", () => {
    const h = renderToString(
      <PhasenListe zeilen={[zeile({ phase: "wachstum" })]} standorte={[]} />,
    );
    expect(h).toContain("Soll-Phase heute: Wachstumsphase");
    expect(h).toContain("Standort: unbekannt");
  });

  it("US-PHA-01 leere Liste sagt, was zu tun ist (P-09)", () => {
    const h = renderToString(<PhasenListe zeilen={[]} standorte={[]} />);
    expect(h).toContain("Ruhephasen-Zeitraum");
    expect(h).toContain("Lege im Bestand ein Exemplar");
  });
});

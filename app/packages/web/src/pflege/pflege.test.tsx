import { renderToString as rendere } from "react-dom/server";
import type { MessAnsicht, MessungZeile } from "@pflanzendex/core";
import { describe, expect, it, vi } from "vitest";
import { pruefeEingabe } from "./eingabe";
import { MessKopf } from "./mess-kopf";
import { MessenFormular } from "./messen-formular";
import { MessenSeite } from "./MessenSeite";
import { MessungListe } from "./messung-liste";
import { erfasseMessung, ladeMessAnsicht } from "./messungen-api";

// React trennt benachbarte Textteile beim Serverrendern mit Kommentaren; für Textprüfungen entfernen wir sie.
const renderToString = (e: Parameters<typeof rendere>[0]) => rendere(e).replaceAll("<!-- -->", "");
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const messung = (extra: Partial<MessungZeile> = {}): MessungZeile => ({
  id: "m1",
  exemplarId: "e1",
  datum: "2026-10-03",
  wert: 12.5,
  qualitaet: "gesund",
  notiz: null,
  bewertungDurch: "halter",
  ...extra,
});
const ansicht = (extra: Partial<MessAnsicht> = {}): MessAnsicht => ({
  exemplarId: "e1",
  wachstumsmass: "rosettendurchmesser",
  messungen: [],
  letzte: null,
  letzteBewertung: null,
  ...extra,
});
const felder = (extra: Record<string, string> = {}) => ({
  wert: "12,5",
  datum: "2026-10-03",
  qualitaet: "gesund",
  notiz: "",
  ...extra,
});

describe("US-WAC-01 Client der Mess-API", () => {
  it("erfasst mit Bearer-Token, Zeitzone des Geräts und frischem Idempotency-Key", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(201, messung()));
    const r = await erfasseMessung({ api: "http://api", token: "tok", abruf }, "e1", {
      wert: 12.5,
      qualitaet: "gesund",
    });
    expect(r).toMatchObject({ ok: true, wert: { wert: 12.5 } });
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare/e1/messungen");
    expect(init?.method).toBe("POST");
    const kopf = init?.headers as Record<string, string>;
    expect(kopf["Authorization"]).toBe("Bearer tok");
    expect(kopf["Idempotency-Key"]).toBeTruthy();
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ wert: 12.5, qualitaet: "gesund" });
    expect(body["zeitzone"]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("ein Fehler der API bleibt ein Fehler mit Code und Text", async () => {
    const fehler = { code: "exemplar.nicht_gefunden", text: "Das Exemplar gibt es nicht." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(404, { fehler }));
    const r = await erfasseMessung({ api: "http://api", token: "tok", abruf }, "e1", {
      wert: 1,
      qualitaet: "gesund",
    });
    expect(r).toMatchObject({ ok: false, fehler: { code: "exemplar.nicht_gefunden" } });
  });

  it("lädt die Ansicht eines Exemplars", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, ansicht()));
    const r = await ladeMessAnsicht("http://api", "tok", "e1", abruf);
    expect(r).toMatchObject({ ok: true, wert: { wachstumsmass: "rosettendurchmesser" } });
    expect(String(abruf.mock.calls[0]?.[0])).toBe("http://api/exemplare/e1/messungen");
  });
});

describe("US-WAC-01 Prüfung der Eingabe vor dem Senden", () => {
  it("akzeptiert Zahlen mit Komma oder Punkt im Schritt 0,5 und baut die Eingabe", () => {
    expect(pruefeEingabe(felder())).toEqual({
      ok: true,
      eingabe: { wert: 12.5, qualitaet: "gesund", datum: "2026-10-03" },
    });
    expect(
      pruefeEingabe(felder({ wert: " 7.5 ", notiz: " Neuer Trieb ", qualitaet: "vergeilt" })),
    ).toMatchObject({
      ok: true,
      eingabe: { wert: 7.5, qualitaet: "vergeilt", notiz: "Neuer Trieb" },
    });
  });

  it.each(["", "abc", "-1", "-0,5", "1e3", "12,3", "1,2,3", "20000"])(
    "lehnt %j ab und nennt, was zu tun ist",
    (wert) => {
      const r = pruefeEingabe(felder({ wert }));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.text).toMatch(/Zahl|Schritten/);
    },
  );

  it("lehnt eine unbekannte Qualität ab", () => {
    expect(pruefeEingabe(felder({ qualitaet: "super" })).ok).toBe(false);
  });
});

describe("US-WAC-01 Ansicht „Messen“", () => {
  it("zeigt Was messen?, letzte Messung und letzte Bewertung", () => {
    const m = messung({ qualitaet: "vergeilt" });
    const html = renderToString(
      <MessKopf ansicht={ansicht({ messungen: [m], letzte: m, letzteBewertung: "vergeilt" })} />,
    );
    expect(html).toContain("Was messen?");
    expect(html).toContain("Rosettendurchmesser");
    expect(html).toContain("12,5 cm am 03.10.2026");
    expect(html).toContain("Vergeilt/dünn");
  });

  it("ohne Messung: „noch keine Messung“, und ohne Art bleibt das Maß „unbekannt“ (P-08)", () => {
    const html = renderToString(<MessKopf ansicht={ansicht({ wachstumsmass: null })} />);
    expect(html).toContain("noch keine Messung");
    expect(html).toContain("noch keine Bewertung");
    expect(html).toContain("unbekannt");
  });

  it("der Verlauf nennt Wert, Datum, Qualität und Notiz; leer sagt er, was zu tun ist (P-09)", () => {
    const liste = renderToString(
      <MessungListe messungen={[messung({ notiz: "nach dem Umtopfen" })]} />,
    );
    expect(liste).toContain("12,5 cm · 03.10.2026");
    expect(liste).toContain("Gesund");
    expect(liste).toContain("nach dem Umtopfen");
    expect(renderToString(<MessungListe messungen={[]} />)).toContain(
      "Trage oben den ersten Messwert ein",
    );
  });

  it("das Formular hat Zahl, Datum, Qualität (gesund voreingestellt), Notiz und sagt, dass das Foto fehlt", () => {
    const html = renderToString(<MessenFormular einheit="cm" onSenden={async () => null} />);
    expect(html).toContain("Messwert (cm, in Schritten von 0,5)");
    expect(html).toMatch(
      /<input type="date" max="\d{4}-\d{2}-\d{2}"[^>]*name="datum" value="\d{4}-\d{2}-\d{2}"/,
    );
    expect(html).toMatch(/<option value="gesund" selected/);
    expect(html).toContain("Vergeilt/dünn");
    expect(html).toContain("Notiz (optional)");
    expect(html).toContain("Ein Foto kannst du hier noch nicht hinzufügen.");
  });

  it("die Seite zeigt zuerst „wird geladen“ und bietet den Weg zurück an", () => {
    const html = renderToString(
      <MessenSeite
        api="http://api"
        token={async () => "tok"}
        exemplar={{ id: "e1", name: "Bogenhanf" }}
        onZurueck={vi.fn()}
      />,
    );
    expect(html).toContain("Messen: Bogenhanf");
    expect(html).toContain("Messungen werden geladen");
    expect(html).toContain("Zurück zum Bestand");
  });
});

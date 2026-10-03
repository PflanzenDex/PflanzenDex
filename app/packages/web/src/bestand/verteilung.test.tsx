// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Lichtzone, Verteilung } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BestandSeite } from "./BestandSeite";
import { ladeVerteilung } from "./verteilung-api";
import { VerteilungAnsicht } from "./verteilung-ansicht";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = (n: number): Lichtzone => ({
  id: `z${n}`,
  name: `Lampe ${n}`,
  luxDecke: 1000 * n,
  ppfd: null,
  reihenfolge: n,
});
const verteilung = (extra: Partial<Verteilung> = {}): Verteilung => ({
  zonen: [
    { zone: zone(2), anzahl: 3 },
    { zone: zone(3), anzahl: 1 },
    { zone: zone(4), anzahl: 1 },
  ],
  duennste: [zone(3), zone(4)],
  nichtGezaehlt: { stecklingslicht: 0, archiviert: 0, zoneUnbekannt: 0 },
  hinweis: {
    text: "Lampe 3 und Lampe 4 sind gleich dünn besetzt (je 1).",
    naechsteHandlung: "Setze Arten für diese Zonen auf die Wunschliste.",
  },
  ...extra,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-LIC-02 Client der Verteilungs-API", () => {
  it("lädt die Verteilung mit Bearer-Token", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { verteilung: verteilung() }));
    const r = await ladeVerteilung("http://api", "tok", abruf);
    expect(r).toMatchObject({ ok: true, wert: { duennste: [{ id: "z3" }, { id: "z4" }] } });
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare/verteilung");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("ein Serverfehler bleibt ein Fehler mit Code, keine leere Verteilung (P-10)", async () => {
    const fehler = { code: "server.fehler", text: "Nicht ladbar." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(500, { fehler }));
    expect(await ladeVerteilung("http://api", "tok", abruf)).toMatchObject({
      ok: false,
      fehler: { code: "server.fehler" },
    });
  });
});

describe("US-LIC-02 Ansicht der Verteilung", () => {
  it("zeigt je Zone 2 bis 4 die Anzahl der Exemplare und markiert die dünnsten Zonen", () => {
    render(<VerteilungAnsicht verteilung={verteilung()} />);
    const liste = screen.getByRole("list", { name: "Exemplare je Lichtzone" });
    const zeilen = within(liste).getAllByRole("listitem");
    expect(zeilen.map((z) => z.textContent)).toEqual([
      expect.stringContaining("Lampe 2: 3 Exemplare"),
      expect.stringContaining("Lampe 3: 1 Exemplar"),
      expect.stringContaining("Lampe 4: 1 Exemplar"),
    ]);
    expect(zeilen[1]?.textContent).toContain("dünnste Zone");
    expect(zeilen[0]?.textContent).not.toContain("dünnste Zone");
  });

  it("nennt die dünnste Zone und die nächste Handlung (P-09), bei Gleichstand mit Hinweis auf die Wunschliste", () => {
    render(<VerteilungAnsicht verteilung={verteilung()} />);
    expect(screen.getByText(/Lampe 3 und Lampe 4 sind gleich dünn besetzt/)).toBeTruthy();
    expect(screen.getByText(/auf die Wunschliste/)).toBeTruthy();
  });

  it("erklärt, dass Stecklingslicht nicht zählt, und nennt die nicht gezählten Exemplare (P-10)", () => {
    render(
      <VerteilungAnsicht
        verteilung={verteilung({
          nichtGezaehlt: { stecklingslicht: 2, archiviert: 1, zoneUnbekannt: 3 },
        })}
      />,
    );
    const rest = screen.getByText(/Nicht mitgezählt/);
    expect(rest.textContent).toContain("2 unter Stecklingslicht");
    expect(rest.textContent).toContain("1 archiviert");
    expect(rest.textContent).toContain("3 mit unbekannter Zone");
  });

  it("zeigt nichts zum Nicht-Mitgezählten, wenn alles gezählt ist", () => {
    render(<VerteilungAnsicht verteilung={verteilung()} />);
    expect(screen.queryByText(/Nicht mitgezählt/)).toBeNull();
  });

  it("ohne Zonen für Erwachsene: keine Liste, nur Hinweis mit Handlung", () => {
    render(
      <VerteilungAnsicht
        verteilung={verteilung({
          zonen: [],
          duennste: [],
          hinweis: {
            text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
            naechsteHandlung: "Lege mindestens zwei Lichtzonen an.",
          },
        })}
      />,
    );
    expect(screen.queryByRole("list", { name: "Exemplare je Lichtzone" })).toBeNull();
    expect(screen.getByText(/Lege mindestens zwei Lichtzonen an/)).toBeTruthy();
  });
});

describe("US-LIC-02 Seite Bestand zeigt die Verteilung", () => {
  const seite = () => (
    <BestandSeite
      api="http://api"
      token={async () => "tok"}
      neueArt={null}
      onArtWaehlen={vi.fn()}
      onAbgeschlossen={vi.fn()}
    />
  );

  it("lädt Karten, Standorte und Verteilung und zeigt die Verteilung über der Liste", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/exemplare/verteilung") return antwort(200, { verteilung: verteilung() });
        if (pfad === "/standorte") return antwort(200, { standorte: [] });
        if (pfad === "/exemplare/archiv") return antwort(200, { archiv: [] });
        return antwort(200, { karten: [] });
      }),
    );
    render(seite());
    expect(
      await screen.findByRole("heading", { name: "Verteilung auf die Lichtzonen" }),
    ).toBeTruthy();
    expect(screen.getByText(/Lampe 3 und Lampe 4 sind gleich dünn besetzt/)).toBeTruthy();
  });

  it("scheitert die Verteilung, wird nichts halb angezeigt: Fehlertext und „Erneut laden“", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/exemplare/verteilung")
          return antwort(500, {
            fehler: { code: "server.fehler", text: "Verteilung nicht ladbar." },
          });
        if (pfad === "/standorte") return antwort(200, { standorte: [] });
        if (pfad === "/exemplare/archiv") return antwort(200, { archiv: [] });
        return antwort(200, { karten: [] });
      }),
    );
    render(seite());
    expect((await screen.findByRole("alert")).textContent).toContain("Verteilung nicht ladbar.");
    expect(screen.getByRole("button", { name: "Erneut laden" })).toBeTruthy();
  });
});

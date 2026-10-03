// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Art, Exemplar, ExemplarKarte } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BestandSeite } from "./BestandSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const art = {
  id: "a1",
  lateinischerName: "Dracaena trifasciata",
  deutscherName: "Bogenhanf",
} as Art;
const exemplar = (extra: Partial<Exemplar> = {}): Exemplar => ({
  id: "e1",
  artId: "a1",
  name: "Bogenhanf",
  kennzeichen: null,
  standortId: null,
  status: "pflanze",
  gefangenAm: "2026-10-03",
  archiviertAm: null,
  archiviertGrund: null,
  messreihe: [],
  behandlungen: [],
  ...extra,
});
const karteVon = (e: Exemplar): ExemplarKarte => ({
  id: e.id,
  name: e.name,
  artName: "Bogenhanf",
  status: e.status,
  standort: e.standortId === "s1" ? "Regal Süd" : null,
  lichtzone: null,
  gefangenAm: e.gefangenAm,
  foto: null,
  letzteMessung: null,
  behandlung: null,
  weitereBehandlungen: 0,
});
const standort = { id: "s1", name: "Regal Süd", lichtzoneId: null, art: "innen" as const };

function fakeServer(opts: { exemplare?: Exemplar[]; anlegen?: () => Promise<Response> } = {}) {
  const posts: { body: Record<string, unknown>; schluessel: string | undefined }[] = [];
  const exemplare = opts.exemplare ?? [];
  const abruf = vi.fn<typeof fetch>(async (url, init) => {
    const pfad = new URL(String(url)).pathname;
    if (init?.method === "POST" && pfad === "/exemplare") {
      posts.push({
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        schluessel: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (opts.anlegen) return opts.anlegen();
      const neu = exemplar({ id: "e2", name: "Bogenhanf – rot", kennzeichen: "rot" });
      exemplare.push(neu);
      return antwort(201, neu);
    }
    if (pfad === "/standorte") return antwort(200, { standorte: [standort] });
    if (pfad === "/exemplare/archiv") return antwort(200, { archiv: [] });
    return antwort(200, { karten: exemplare.map(karteVon) });
  });
  vi.stubGlobal("fetch", abruf);
  return { abruf, posts };
}

const seite = (extra: Partial<Parameters<typeof BestandSeite>[0]> = {}) => (
  <BestandSeite
    api="http://api"
    token={async () => "tok"}
    neueArt={null}
    onArtWaehlen={vi.fn()}
    onAbgeschlossen={vi.fn()}
    {...extra}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-02 Seite Bestand", () => {
  it("zeigt erst einen Ladestatus, dann die Exemplare mit Standort-Namen", async () => {
    fakeServer({ exemplare: [exemplar({ standortId: "s1" })] });
    render(seite());
    expect(screen.getByRole("status").textContent).toContain("Bestand wird geladen");
    expect(await screen.findByText("Standort: Regal Süd")).toBeTruthy();
  });

  it("ohne Anmeldung: Fehlertext und „Erneut laden“ statt leerer Liste (P-10)", async () => {
    const { abruf } = fakeServer();
    render(seite({ token: async () => undefined }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(abruf).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Erneut laden" })).toBeTruthy();
  });

  it("scheitert eine der beiden Abfragen, wird nichts halb angezeigt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/standorte")
          return antwort(500, {
            fehler: { code: "server.fehler", text: "Standorte nicht ladbar." },
          });
        return pfad === "/exemplare/archiv"
          ? antwort(200, { archiv: [] })
          : antwort(200, { karten: [karteVon(exemplar())] });
      }),
    );
    render(seite());
    expect((await screen.findByRole("alert")).textContent).toContain("Standorte nicht ladbar.");
    expect(screen.queryByText("Bogenhanf")).toBeNull();
  });

  it("mit gewählter Art: legt das Exemplar mit Kennzeichen und Standort an und meldet den Abschluss", async () => {
    const { posts } = fakeServer();
    const onAbgeschlossen = vi.fn();
    render(seite({ neueArt: art, onAbgeschlossen }));
    expect(await screen.findByText("Name: Bogenhanf")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Kennzeichen (optional)"), "rot");
    expect(screen.getByText("Name: Bogenhanf – rot")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Standort"), "s1");
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(onAbgeschlossen).toHaveBeenCalledOnce());
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toMatchObject({ artId: "a1", kennzeichen: "rot", standortId: "s1" });
    expect(posts[0]?.schluessel).toBeTruthy();
  });

  it("nur die Art ist Pflicht: ohne Standort bleibt er unbekannt und wird nicht gesendet (P-08)", async () => {
    const { posts } = fakeServer();
    render(seite({ neueArt: art }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body["standortId"]).toBeUndefined();
    expect(posts[0]?.body["kennzeichen"]).toBeUndefined();
  });

  it("ein vergebener Name bleibt im Formular mit Fehler, vorhandenen Exemplaren und Handlungsaufforderung", async () => {
    fakeServer({
      anlegen: () =>
        antwort(409, {
          fehler: {
            code: "exemplar.name_vergeben",
            text: "Ein Exemplar mit diesem Namen gibt es schon.",
            daten: { name: "Bogenhanf", vorhandene: [{ id: "e1", name: "Bogenhanf" }] },
          },
        }),
    });
    const onAbgeschlossen = vi.fn();
    render(seite({ neueArt: art, onAbgeschlossen }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    const box = await screen.findByRole("alert");
    expect(box.textContent).toContain("Ein Exemplar mit diesem Namen gibt es schon.");
    expect(box.textContent).toContain("Schon vorhanden: Bogenhanf");
    expect(onAbgeschlossen).not.toHaveBeenCalled();
    // Tippen eines Kennzeichens räumt den Fehler weg: die nächste Eingabe zählt.
    await userEvent.type(screen.getByLabelText("Kennzeichen (optional)"), "r");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("der Zurück-Knopf des Formulars führt zur Artwahl", async () => {
    fakeServer();
    const onArtWaehlen = vi.fn();
    render(seite({ neueArt: art, onArtWaehlen }));
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zur Art" }));
    expect(onArtWaehlen).toHaveBeenCalledOnce();
  });

  it("nach dem Anlegen mit unbekanntem Standort sagt die Liste, warum er unbekannt ist", async () => {
    fakeServer();
    const { rerender } = render(seite({ neueArt: art }));
    await userEvent.click(await screen.findByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "http://api/exemplare",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    rerender(seite({ neueArt: null }));
    expect((await screen.findByRole("status")).textContent).toContain("ist angelegt");
    expect(screen.getByRole("status").textContent).toContain("Der Standort ist unbekannt");
  });
});

describe("US-BES-06 Karten auf der Seite Bestand", () => {
  it("zeigt Messung, Notiz (einklappbar), Foto-Link und Behandlung aus der Karten-API", async () => {
    const karte: ExemplarKarte = {
      ...karteVon(exemplar({ standortId: "s1" })),
      lichtzone: "Zone 3",
      foto: { url: "https://medien.test/x.jpg", datum: "2026-09-28" },
      letzteMessung: { datum: "2026-10-01", qualitaet: "vergeilt", notiz: "Streckt sich." },
      behandlung: {
        grund: "Neem spritzen",
        faelligkeit: { art: "ueberfaellig", tage: 1, text: "überfällig seit 1 Tg." },
      },
      weitereBehandlungen: 2,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/standorte") return antwort(200, { standorte: [standort] });
        return pfad === "/exemplare/archiv"
          ? antwort(200, { archiv: [] })
          : antwort(200, { karten: [karte] });
      }),
    );
    render(seite());
    expect(await screen.findByText("Lichtzone: Zone 3 · Status: Pflanze")).toBeTruthy();
    const foto = screen.getByRole("link", { name: "Foto von Bogenhanf groß öffnen" });
    expect(foto.getAttribute("href")).toBe("https://medien.test/x.jpg");
    expect(screen.getByText(/kein Erfolgssignal/)).toBeTruthy();
    expect(screen.getByText("überfällig seit 1 Tg.")).toBeTruthy();
    expect(screen.getByText(/\+2 weitere/)).toBeTruthy();
    const details = screen.getByText("Notiz der Messung").closest("details");
    expect(details?.open).toBe(false);
    await userEvent.click(screen.getByText("Notiz der Messung"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("Streckt sich.")).toBeTruthy();
  });
});

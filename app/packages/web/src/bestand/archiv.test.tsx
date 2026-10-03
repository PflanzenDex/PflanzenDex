// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ArchivEintrag, ExemplarKarte } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiviere, ladeArchiv, stelleWiederHer } from "./archiv-api";
import { BestandSeite } from "./BestandSeite";

// US-BES-07: Archivieren und Wiederherstellen in der Oberfläche (jsdom, Server nachgebaut).
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const karte = (id: string, name: string): ExemplarKarte => ({
  id,
  name,
  artName: "Bogenhanf",
  status: "pflanze",
  standort: null,
  lichtzone: null,
  gefangenAm: "2026-09-01",
  foto: null,
  letzteMessung: null,
  behandlung: null,
  weitereBehandlungen: 0,
});
const eintrag = (extra: Partial<ArchivEintrag> = {}): ArchivEintrag => ({
  id: "e9",
  name: "Alter Ficus",
  artName: "Birkenfeige",
  gefangenAm: "2026-01-05",
  archiviertAm: "2026-10-02",
  archiviertGrund: "eingegangen",
  ...extra,
});

type Post = { pfad: string; body: Record<string, unknown>; schluessel: string | undefined };
function fakeServer(opts: { archivFehler?: Response; startArchiv?: ArchivEintrag[] } = {}) {
  const karten = [karte("e1", "Bogenhanf"), karte("e2", "Bogenhanf – rot")];
  const archiv = [...(opts.startArchiv ?? [])];
  const posts: Post[] = [];
  const abruf = vi.fn<typeof fetch>(async (url, init) => {
    const pfad = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({
        pfad,
        body,
        schluessel: (init.headers as Record<string, string>)["Idempotency-Key"],
      });
      if (opts.archivFehler) return opts.archivFehler.clone();
      const id = pfad.split("/")[2] ?? "";
      if (pfad.endsWith("/archivieren")) {
        const i = karten.findIndex((k) => k.id === id);
        const [weg] = karten.splice(i, 1);
        archiv.push(eintrag({ id, name: weg?.name ?? "", archiviertGrund: String(body["grund"]) }));
      } else {
        archiv.splice(0, archiv.length, ...archiv.filter((a) => a.id !== id));
      }
      return antwort(200, {});
    }
    if (pfad === "/standorte") return antwort(200, { standorte: [] });
    if (pfad === "/exemplare/archiv") return antwort(200, { archiv });
    return antwort(200, { karten });
  });
  vi.stubGlobal("fetch", abruf);
  return { abruf, posts };
}
const seite = () => (
  <BestandSeite
    api="http://api"
    token={async () => "tok"}
    neueArt={null}
    onArtWaehlen={vi.fn()}
    onAbgeschlossen={vi.fn()}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-07 Client der Archiv-API", () => {
  it("lädt das Archiv mit Bearer-Token", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { archiv: [eintrag()] }));
    expect(await ladeArchiv("http://api", "tok", abruf)).toMatchObject({
      ok: true,
      wert: [{ id: "e9" }],
    });
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare/archiv");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("archiviert mit Grund, Zeitzone des Geräts und Wiederholungsschutz-Schlüssel", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, {}));
    await archiviere("http://api", "tok", { id: "e1", grund: "verkauft" }, abruf);
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare/e1/archivieren");
    expect(JSON.parse(String(init?.body))).toEqual({
      grund: "verkauft",
      zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
  });

  it("ein Serverfehler bleibt ein Fehler mit Code (P-10)", async () => {
    const fehler = { code: "exemplar.bereits_archiviert", text: "Schon archiviert." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(409, { fehler }));
    expect(await stelleWiederHer("http://api", "tok", "e1", abruf)).toMatchObject({
      ok: false,
      fehler: { code: "exemplar.bereits_archiviert" },
    });
  });
});

describe("US-BES-07 Archivieren auf der Seite Bestand", () => {
  it("jede Karte hat „Archivieren“; der Dialog bietet die Gründe an und bricht ohne Anfrage ab", async () => {
    const { posts } = fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    const form = screen.getByRole("form", { name: "Exemplar archivieren" });
    for (const g of ["eingegangen", "abgegeben", "getauscht", "verschenkt", "verkauft"])
      expect(within(form).getByRole("option", { name: g })).toBeTruthy();
    expect(within(form).getByRole("option", { name: "anderer Grund …" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("form", { name: "Exemplar archivieren" })).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("archiviert mit gewähltem Grund, nimmt die Karte aus der Liste und sagt, wo sie jetzt ist (P-09, P-10)", async () => {
    const { posts } = fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.selectOptions(screen.getByLabelText("Grund"), "verkauft");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      pfad: "/exemplare/e1/archivieren",
      body: { grund: "verkauft" },
    });
    expect(posts[0]?.schluessel).toBeTruthy();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("„Bogenhanf“ ist archiviert");
    expect(status.textContent).toContain("Archiv");
    expect(screen.queryByRole("button", { name: "Archivieren: Bogenhanf" })).toBeNull();
    expect(screen.getByRole("button", { name: "Archivieren: Bogenhanf – rot" })).toBeTruthy();
  });

  it("ein freier Grund wird getrimmt gesendet; ein leerer wird nicht gesendet", async () => {
    const { posts } = fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.selectOptions(screen.getByLabelText("Grund"), "anderer Grund …");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Grund");
    expect(posts).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Eigener Grund"), "  Katze war schneller ");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body["grund"]).toBe("Katze war schneller");
  });

  it("scheitert das Archivieren, bleibt der Dialog mit dem Fehlertext offen (P-10)", async () => {
    fakeServer({
      archivFehler: new Response(
        JSON.stringify({
          fehler: {
            code: "exemplar.bereits_archiviert",
            text: "Dieses Exemplar ist schon archiviert.",
          },
        }),
        { status: 409 },
      ),
    });
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    expect((await screen.findByRole("alert")).textContent).toContain("schon archiviert");
    expect(screen.getByRole("form", { name: "Exemplar archivieren" })).toBeTruthy();
  });
});

describe("US-BES-07 Archiv und Wiederherstellen", () => {
  it("zeigt archivierte Exemplare mit Art, Datum und Grund; ohne Archiv gibt es den Abschnitt nicht", async () => {
    fakeServer();
    render(seite());
    await screen.findByText("Bogenhanf – rot");
    expect(screen.queryByRole("heading", { name: "Archiv" })).toBeNull();
    cleanup();
    fakeServer({ startArchiv: [eintrag()] });
    render(seite());
    const archiv = await screen.findByRole("region", { name: "Archiv" });
    expect(archiv.textContent).toContain("Alter Ficus");
    expect(archiv.textContent).toContain("Art: Birkenfeige");
    expect(archiv.textContent).toContain("Archiviert am 02.10.2026");
    expect(archiv.textContent).toContain("Grund: eingegangen");
  });

  it("Wiederherstellen schickt die Anfrage und holt das Exemplar zurück in die Karten", async () => {
    const { posts } = fakeServer({ startArchiv: [eintrag({ id: "e1", name: "Bogenhanf" })] });
    render(seite());
    await userEvent.click(
      await screen.findByRole("button", { name: "Wiederherstellen: Bogenhanf" }),
    );
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.pfad).toBe("/exemplare/e1/wiederherstellen");
    expect((await screen.findByRole("status")).textContent).toContain("wiederhergestellt");
    expect(screen.queryByRole("region", { name: "Archiv" })).toBeNull();
  });

  it("scheitert das Wiederherstellen, steht der Fehler da und das Exemplar bleibt im Archiv (P-10)", async () => {
    fakeServer({
      startArchiv: [eintrag()],
      archivFehler: new Response(
        JSON.stringify({
          fehler: { code: "exemplar.nicht_archiviert", text: "Nicht archiviert." },
        }),
        { status: 409 },
      ),
    });
    render(seite());
    await userEvent.click(
      await screen.findByRole("button", { name: "Wiederherstellen: Alter Ficus" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Nicht archiviert.");
    expect(screen.getByRole("region", { name: "Archiv" })).toBeTruthy();
  });
});

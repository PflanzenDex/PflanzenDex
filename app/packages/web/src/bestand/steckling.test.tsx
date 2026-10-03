// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Art, ExemplarKarte } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BestandSeite } from "./BestandSeite";
import { legeExemplarAn, topfeEin } from "./exemplare-api";
import { LEERE_VERTEILUNG } from "./verteilung-testhilfe";

// US-BES-04: Steckling anlegen und eintopfen in der Oberfläche (jsdom, Server nachgebaut).
const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const art = {
  id: "a1",
  lateinischerName: "Dracaena trifasciata",
  deutscherName: "Bogenhanf",
} as Art;
const karte = (id: string, name: string, status: ExemplarKarte["status"]): ExemplarKarte => ({
  id,
  name,
  artName: "Bogenhanf",
  status,
  standort: null,
  lichtzone: status === "steckling" ? "Lampe 1" : null,
  gefangenAm: "2026-09-01",
  foto: null,
  letzteMessung: null,
  behandlung: null,
  weitereBehandlungen: 0,
});

type Post = { pfad: string; body: Record<string, unknown>; schluessel: string | undefined };
function fakeServer(opts: { eintopfenFehler?: Response } = {}) {
  const karten = [karte("e1", "Ableger", "steckling"), karte("e2", "Alte Pflanze", "pflanze")];
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
      if (pfad.endsWith("/eintopfen")) {
        if (opts.eintopfenFehler) return opts.eintopfenFehler.clone();
        const k = karten.find((x) => x.id === pfad.split("/")[2]);
        if (k) karten[karten.indexOf(k)] = { ...k, status: "pflanze", lichtzone: null };
      }
      return antwort(201, { id: "neu", name: "Bogenhanf", standortId: null, status: "steckling" });
    }
    if (pfad === "/standorte") return antwort(200, { standorte: [] });
    if (pfad === "/exemplare/archiv") return antwort(200, { archiv: [] });
    if (pfad === "/exemplare/verteilung") return antwort(200, LEERE_VERTEILUNG);
    return antwort(200, { karten });
  });
  vi.stubGlobal("fetch", abruf);
  return { posts };
}
const seite = (neueArt: Art | null = null) => (
  <BestandSeite
    api="http://api"
    token={async () => "tok"}
    neueArt={neueArt}
    onArtWaehlen={vi.fn()}
    onAbgeschlossen={vi.fn()}
  />
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-04 Client der Exemplar-API", () => {
  it("US-BES-04: legt einen Steckling mit status an", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(201, { id: "e1" }));
    await legeExemplarAn("http://api", "tok", { artId: "a1", status: "steckling" }, abruf);
    const [, init] = abruf.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ artId: "a1", status: "steckling" });
  });

  it("US-BES-04: topft mit Bearer-Token und frischem Idempotency-Key ein", async () => {
    const abruf = vi.fn<typeof fetch>(async () => antwort(200, { id: "e1", status: "pflanze" }));
    const r = await topfeEin("http://api", "tok", "e1", abruf);
    const [url, init] = abruf.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/exemplare/e1/eintopfen");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(r).toMatchObject({ ok: true, wert: { status: "pflanze" } });
  });

  it("US-BES-04: ein Serverfehler bleibt ein Fehler mit Code (P-10)", async () => {
    const fehler = { code: "exemplar.kein_steckling", text: "Kein Steckling." };
    const abruf = vi.fn<typeof fetch>(async () => antwort(409, { fehler }));
    expect(await topfeEin("http://api", "tok", "e1", abruf)).toMatchObject({
      ok: false,
      fehler: { code: "exemplar.kein_steckling" },
    });
  });
});

describe("US-BES-04 Steckling anlegen im Formular", () => {
  it("US-BES-04: ohne Häkchen bleibt es eine Pflanze, das Häkchen sendet status steckling", async () => {
    const { posts } = fakeServer();
    render(seite(art));
    const haken = await screen.findByRole("checkbox", { name: /Das ist ein Steckling/ });
    expect((haken as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.body).not.toHaveProperty("status");
    await userEvent.click(haken);
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.body["status"]).toBe("steckling");
  });

  it("US-BES-04: das Formular erklärt, was ein Steckling bedeutet (P-09)", async () => {
    fakeServer();
    render(seite(art));
    const hinweis = (await screen.findByText(/Stecklingslicht/)).textContent;
    expect(hinweis).toContain("Phasen");
    expect(hinweis).toContain("Lichtverteilung");
  });
});

describe("US-BES-04 Eingetopft auf der Karte", () => {
  it("US-BES-04: nur ein Steckling hat „Eingetopft“", async () => {
    fakeServer();
    render(seite());
    expect(await screen.findByRole("button", { name: "Eingetopft: Ableger" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eingetopft: Alte Pflanze" })).toBeNull();
  });

  it("US-BES-04: Eingetopft sendet die Anfrage, lädt neu und sagt, wie es weitergeht (P-09)", async () => {
    const { posts } = fakeServer();
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Eingetopft: Ableger" }));
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ pfad: "/exemplare/e1/eintopfen", body: {} });
    expect(posts[0]?.schluessel).toBeTruthy();
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("„Ableger“ ist eingetopft");
    expect(status.textContent).toContain("Lichtzone");
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Eingetopft: Ableger" })).toBeNull(),
    );
  });

  it("US-BES-04: scheitert das Eintopfen, bleibt die Karte und der Fehlertext steht da (P-10)", async () => {
    fakeServer({
      eintopfenFehler: new Response(
        JSON.stringify({
          fehler: { code: "exemplar.kein_steckling", text: "Dieses Exemplar ist kein Steckling." },
        }),
        { status: 409 },
      ),
    });
    render(seite());
    await userEvent.click(await screen.findByRole("button", { name: "Eingetopft: Ableger" }));
    expect((await screen.findByRole("alert")).textContent).toContain("kein Steckling");
    expect(screen.getByRole("button", { name: "Eingetopft: Ableger" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LichtSeite } from "./LichtSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = { id: "z1", name: "Lampe 2", luxDecke: 15000, ppfd: 300, reihenfolge: 2 };
const standort = { id: "s1", name: "Balkon", lichtzoneId: null, art: "aussen" as const };

type Daten = { zonen: unknown[]; standorte: unknown[] };
type Route = (daten: Daten, body: unknown) => Promise<Response>;

/** Routen des Fake-Servers je „METHODE pfad“; Schreibaufrufe landen in `daten` und damit beim Neuladen in der Antwort. */
const ROUTEN: Record<string, Route> = {
  "POST /lichtzonen": async (d, body) => {
    d.zonen.push({ id: "z9", reihenfolge: 9, ppfd: null, ...(body as object) });
    return antwort(201, {});
  },
  "POST /lichtzonen/voreinstellung": () =>
    antwort(409, {
      fehler: { code: "lichtzone.voreinstellung_nicht_leer", text: "Es gibt schon Zonen." },
    }),
  "PUT /lichtzonen/z1": async (d, body) => {
    d.zonen[0] = { ...zone, ...(body as object) };
    return antwort(200, {});
  },
  "DELETE /lichtzonen/z1": () =>
    antwort(409, {
      fehler: {
        code: "lichtzone.in_benutzung",
        text: "Die Zone wird noch benutzt.",
        daten: [{ id: "s1", name: "Balkon" }],
      },
    }),
  "POST /standorte": async (d, body) => {
    d.standorte.push({ id: "s9", ...(body as object) });
    return antwort(201, {});
  },
  "PUT /standorte/s1": async (d, body) => {
    d.standorte[0] = { ...standort, ...(body as object) };
    return antwort(200, {});
  },
  "GET /lichtzonen": (d) => antwort(200, { zonen: d.zonen }),
  "GET /standorte": (d) => antwort(200, { standorte: d.standorte }),
  "GET /hinweise": () => antwort(200, { hinweise: [] }),
};

function fakeServer(start: { zonen?: unknown[]; standorte?: unknown[] } = {}) {
  const daten: Daten = { zonen: start.zonen ?? [], standorte: start.standorte ?? [] };
  const aufrufe: { methode: string; url: string; body: unknown; schluessel: string | undefined }[] =
    [];
  const abruf = vi.fn<typeof fetch>(async (url, init) => {
    const pfad = new URL(String(url)).pathname;
    const methode = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const kopf = init?.headers as Record<string, string>;
    aufrufe.push({ methode, url: pfad, body, schluessel: kopf["Idempotency-Key"] });
    return (ROUTEN[`${methode} ${pfad}`] ?? (() => antwort(404, {})))(daten, body);
  });
  vi.stubGlobal("fetch", abruf);
  return { abruf, aufrufe };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-LIC-05 Seite Standorte und Lichtzonen", () => {
  it("zeigt während des Ladens einen Status und danach Zone und Standort aus der API", async () => {
    fakeServer({ zonen: [zone], standorte: [standort] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(await screen.findByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Balkon" })).toBeTruthy();
  });

  it("ohne Anmeldung: Fehlertext mit Aktion „Erneut versuchen“, kein Aufruf der API (P-09)", async () => {
    const { abruf } = fakeServer();
    const token = vi.fn<() => Promise<string | undefined>>(async () => undefined);
    render(<LichtSeite api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(abruf).not.toHaveBeenCalled();
    token.mockResolvedValue("tok");
    fakeServer({ zonen: [zone] });
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("heading", { name: "Lampe 2" })).toBeTruthy();
  });

  it("ein Serverfehler beim Laden wird mit seinem Text gezeigt, nichts halb angezeigt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        antwort(500, { fehler: { code: "server.fehler", text: "Das hat nicht geklappt." } }),
      ),
    );
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Das hat nicht geklappt.");
  });

  it("legt eine Zone an: sendet mit Idempotency-Key und lädt danach neu", async () => {
    const { aufrufe } = fakeServer();
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await screen.findByText("Noch keine Lichtzonen", { exact: false });
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Lichtzone anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.type(screen.getByLabelText("Lux-Decke (Lux)"), "8000");
    await userEvent.click(screen.getByRole("button", { name: "Zone anlegen" }));
    expect(await screen.findByRole("heading", { name: "Fensterbank" })).toBeTruthy();
    const post = aufrufe.find((a) => a.methode === "POST" && a.url === "/lichtzonen");
    expect(post?.body).toEqual({
      name: "Fensterbank",
      luxDecke: 8000,
      ppfd: null,
      reihenfolge: null,
    });
    expect(post?.schluessel).toBeTruthy();
  });

  it("legt einen Standort ohne Zone an und nennt ihn danach in der Liste", async () => {
    const { aufrufe } = fakeServer({ zonen: [zone] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await screen.findByRole("heading", { name: "Lampe 2" });
    await userEvent.type(
      screen.getByLabelText("Name", { selector: "form[aria-label='Standort anlegen'] input" }),
      "Fensterbank",
    );
    await userEvent.selectOptions(screen.getAllByLabelText("Art")[0] as HTMLElement, "aussen");
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    expect(await screen.findByRole("heading", { name: "Fensterbank" })).toBeTruthy();
    const post = aufrufe.find((a) => a.methode === "POST" && a.url === "/standorte");
    expect(post?.body).toEqual({ name: "Fensterbank", lichtzoneId: null, art: "aussen" });
  });

  it("ein abgelehntes Schreiben zeigt den Fehlertext der API und bietet weiter die Aktion an", async () => {
    fakeServer();
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Standard-Lampen übernehmen" }),
    );
    expect((await screen.findAllByText("Es gibt schon Zonen.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Standard-Lampen übernehmen" })).toBeTruthy();
  });

  it("ändert eine Zone: das Formular zeigt die alten Werte, nach dem Speichern steht der neue Name da", async () => {
    const { aufrufe } = fakeServer({ zonen: [zone] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ändern" }));
    const name = screen.getByLabelText("Name", {
      selector: "form[aria-label='Lampe 2 ändern'] input",
    });
    expect((name as HTMLInputElement).value).toBe("Lampe 2");
    await userEvent.clear(name);
    await userEvent.type(name, "Lampe 3");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByRole("heading", { name: "Lampe 3" })).toBeTruthy();
    const put = aufrufe.find((a) => a.methode === "PUT");
    expect(put?.body).toMatchObject({ name: "Lampe 3", luxDecke: 15000, ppfd: 300 });
  });

  it("Abbrechen beim Ändern verwirft die Eingabe ohne Schreibaufruf", async () => {
    const { aufrufe } = fakeServer({ zonen: [zone] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ändern" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(aufrufe.every((a) => a.methode === "GET")).toBe(true);
  });

  it("Löschen fragt nach; eine benutzte Zone bleibt mit dem Fehlertext der API stehen", async () => {
    const { aufrufe } = fakeServer({ zonen: [zone] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Löschen" }));
    expect(aufrufe.some((a) => a.methode === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Ja, „Lampe 2“ löschen" }));
    expect((await screen.findAllByText("Die Zone wird noch benutzt.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Lampe 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("Löschen lässt sich abbrechen", async () => {
    fakeServer({ zonen: [zone] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("weist einem Standort ohne Zone eine Lichtzone zu", async () => {
    const { aufrufe } = fakeServer({ zonen: [zone], standorte: [standort] });
    render(<LichtSeite api="http://api" token={async () => "tok"} />);
    await userEvent.click(await screen.findByRole("button", { name: "Lichtzone zuweisen" }));
    await userEvent.selectOptions(
      screen.getByLabelText("Lichtzone", { selector: "form[aria-label='Balkon ändern'] select" }),
      "z1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Lampe 2 · außen")).toBeTruthy();
    expect(aufrufe.find((a) => a.url === "/standorte/s1")?.body).toEqual({
      name: "Balkon",
      lichtzoneId: "z1",
      art: "aussen",
    });
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessenSeite } from "./MessenSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const messung = {
  id: "m1",
  exemplarId: "e1",
  datum: "2026-10-01",
  wert: 12.5,
  qualitaet: "gesund",
  notiz: null,
  bewertungDurch: "halter",
};
const exemplar = { id: "e1", name: "Bogenhanf" };

function fakeServer(opts: { ladenFehler?: boolean; speichern?: () => Promise<Response> } = {}) {
  const messungen: unknown[] = [];
  const posts: { body: Record<string, unknown>; schluessel: string | undefined }[] = [];
  let ladeversuche = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "POST") {
        posts.push({
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
          schluessel: (init.headers as Record<string, string>)["Idempotency-Key"],
        });
        if (opts.speichern) return opts.speichern();
        messungen.unshift(messung);
        return antwort(201, messung);
      }
      ladeversuche += 1;
      if (opts.ladenFehler && ladeversuche === 1)
        return antwort(500, { fehler: { code: "server.fehler", text: "Das hat nicht geklappt." } });
      return antwort(200, {
        exemplarId: "e1",
        wachstumsmass: "hoehe",
        messungen,
        letzte: messungen[0] ?? null,
        letzteBewertung: messungen.length ? "gesund" : null,
      });
    }),
  );
  return { posts };
}

const zeige = (token: () => Promise<string | undefined> = async () => "tok", onZurueck = vi.fn()) =>
  render(<MessenSeite api="http://api" token={token} exemplar={exemplar} onZurueck={onZurueck} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-01 Seite Messen", () => {
  it("US-WAC-01 zeigt nach dem Laden Was messen? und den leeren Verlauf mit nächstem Schritt (P-09)", async () => {
    fakeServer();
    zeige();
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect(
      await screen.findByText("Noch keine Messung. Trage oben den ersten Messwert ein."),
    ).toBeTruthy();
    expect(screen.getByText(/Höhe\./)).toBeTruthy();
  });

  it("US-WAC-01 speichert mit Idempotency-Key, meldet die Messung und lädt den Verlauf neu", async () => {
    const { posts } = fakeServer();
    zeige();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,5");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect(await screen.findByText("Gespeichert: 12,5 cm am 01.10.2026.")).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 3, name: "12,5 cm · 01.10.2026" }),
    ).toBeTruthy();
    expect(posts[0]?.body).toMatchObject({ wert: 12.5, qualitaet: "gesund" });
    expect(posts[0]?.schluessel).toBeTruthy();
  });

  it("US-WAC-01 eine ungültige Eingabe wird vor dem Senden abgelehnt und schreibt nichts", async () => {
    const { posts } = fakeServer();
    zeige();
    await userEvent.type(await screen.findByLabelText(/Messwert/), "12,3");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Schritten von 0,5");
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 lehnt der Server ab, steht sein Text da und die Eingabe bleibt", async () => {
    fakeServer({
      speichern: () =>
        antwort(404, {
          fehler: { code: "exemplar.nicht_gefunden", text: "Das Exemplar gibt es nicht." },
        }),
    });
    zeige();
    const feld = await screen.findByLabelText(/Messwert/);
    await userEvent.type(feld, "10");
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Das Exemplar gibt es nicht.");
    expect((feld as HTMLInputElement).value).toBe("10");
  });

  it("US-WAC-01 ohne Anmeldung beim Speichern: Hinweis zum Anmelden statt Aufruf", async () => {
    const { posts } = fakeServer();
    let angemeldet = true;
    zeige(async () => (angemeldet ? "tok" : undefined));
    await userEvent.type(await screen.findByLabelText(/Messwert/), "10");
    angemeldet = false;
    await userEvent.click(screen.getByRole("button", { name: "Messung speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(posts).toHaveLength(0);
  });

  it("US-WAC-01 ein Ladefehler bietet Erneut laden an, danach erscheint die Ansicht", async () => {
    fakeServer({ ladenFehler: true });
    zeige();
    expect((await screen.findByRole("alert")).textContent).toContain("Das hat nicht geklappt.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByText("Verlauf")).toBeTruthy();
  });

  it("US-WAC-01 ohne Anmeldung beim Laden: Fehlertext, kein Aufruf der API", async () => {
    fakeServer();
    zeige(async () => undefined);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("US-WAC-01 Zurück zum Bestand ruft den Rückweg auf", async () => {
    fakeServer();
    const zurueck = vi.fn();
    zeige(async () => "tok", zurueck);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Bestand" }));
    expect(zurueck).toHaveBeenCalledOnce();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PflegephasenSeite } from "./PflegephasenSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const phase = {
  exemplarId: "e1",
  name: "Bogenhanf",
  artId: "a1",
  phase: "ruhe",
  standortId: "s1",
  sollStandortId: null,
};
const standort = { id: "s1", name: "Regal Süd", lichtzoneId: null, art: "innen" };
const serverFehler = { fehler: { code: "server.fehler", text: "Der Server antwortet nicht." } };

/** Fake-Server je Pfad; Fremdsystem ist nur das Netz, Seite und Module laufen echt. */
function fakeServer(routen: Record<string, () => Promise<Response>>) {
  const abruf = vi.fn<typeof fetch>(async (url) => {
    const pfad = new URL(String(url)).pathname;
    return (routen[pfad] ?? (() => antwort(404, {})))();
  });
  vi.stubGlobal("fetch", abruf);
  return abruf;
}
const token = async () => "tok";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-01 Seite der Pflegephasen", () => {
  it("US-PHA-01 zeigt nach dem Laden Phase und Standort des Exemplars", async () => {
    fakeServer({
      "/pflegephasen": () => antwort(200, { phasen: [phase] }),
      "/standorte": () => antwort(200, { standorte: [standort] }),
    });
    render(<PflegephasenSeite api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
    expect(screen.getByText("Soll-Phase heute: Ruhephase")).toBeTruthy();
    expect(screen.getByText("Standort: Regal Süd")).toBeTruthy();
  });

  it("US-PHA-01 ohne Anmeldung kommt die Aufforderung zur Anmeldung und nichts wird abgefragt", async () => {
    const abruf = fakeServer({});
    render(<PflegephasenSeite api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(abruf).not.toHaveBeenCalled();
  });

  it("US-PHA-01 scheitert die Phasenabfrage, steht der Fehler da und Erneut laden holt die Liste", async () => {
    let versuch = 0;
    fakeServer({
      "/pflegephasen": () =>
        ++versuch === 1 ? antwort(500, serverFehler) : antwort(200, { phasen: [phase] }),
      "/standorte": () => antwort(200, { standorte: [standort] }),
    });
    render(<PflegephasenSeite api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-PHA-01 scheitern die Standorte, scheitert das Laden als Ganzes", async () => {
    fakeServer({
      "/pflegephasen": () => antwort(200, { phasen: [phase] }),
      "/standorte": () => antwort(500, serverFehler),
    });
    render(<PflegephasenSeite api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.queryByText("Bogenhanf")).toBeNull();
  });

  it("US-PHA-01 eine verlassene Seite zeigt eine späte Antwort nicht mehr", async () => {
    let fertig: (r: Response) => void = () => undefined;
    const abruf = fakeServer({
      "/pflegephasen": () => new Promise<Response>((ok) => (fertig = ok)),
      "/standorte": () => antwort(200, { standorte: [] }),
    });
    const { unmount, container } = render(<PflegephasenSeite api="http://api" token={token} />);
    await vi.waitFor(() => expect(abruf).toHaveBeenCalledTimes(2));
    unmount();
    fertig(new Response(JSON.stringify({ phasen: [phase] }), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });
});

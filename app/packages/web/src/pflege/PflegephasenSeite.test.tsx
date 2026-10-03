// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PflegephasenSeite } from "./PflegephasenSeite";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zeile = {
  exemplarId: "e1",
  name: "Bogenhanf",
  artId: "a1",
  phase: "ruhe",
  standortId: "s1",
  sollStandortId: null,
};
const standort = { id: "s1", name: "Regal Süd", lichtzoneId: null, art: "innen" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-PHA-01 Seite Pflegephasen", () => {
  it("US-PHA-01 zeigt erst einen Ladestatus, dann die Phasen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/standorte"
          ? antwort(200, { standorte: [standort] })
          : antwort(200, { phasen: [zeile] }),
      ),
    );
    render(<PflegephasenSeite api="http://api" token={async () => "tok"} />);
    expect(screen.getByRole("status").textContent).toContain("Pflegephasen werden geladen");
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
  });

  it("US-PHA-01 ohne Anmeldung: Fehlertext statt leerer Liste, ohne Abruf", async () => {
    const abruf = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", abruf);
    render(<PflegephasenSeite api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(abruf).not.toHaveBeenCalled();
  });

  it("US-PHA-01 scheitert eine Abfrage, wird nichts halb gezeigt und „Erneut laden“ lädt neu", async () => {
    let n = 0;
    const abruf = vi.fn<typeof fetch>(async (url) => {
      const pfad = new URL(String(url)).pathname;
      if (pfad === "/standorte") return antwort(200, { standorte: [standort] });
      n += 1;
      return n === 1
        ? antwort(500, { fehler: { code: "server.fehler", text: "Phasen nicht ladbar." } })
        : antwort(200, { phasen: [zeile] });
    });
    vi.stubGlobal("fetch", abruf);
    render(<PflegephasenSeite api="http://api" token={async () => "tok"} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Phasen nicht ladbar.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByText("Bogenhanf")).toBeTruthy();
  });

  it("US-PHA-01 scheitern die Standorte, bleibt der Fehler sichtbar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/standorte"
          ? antwort(500, { fehler: { code: "server.fehler", text: "Standorte nicht ladbar." } })
          : antwort(200, { phasen: [zeile] }),
      ),
    );
    render(<PflegephasenSeite api="http://api" token={async () => "tok"} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Standorte nicht ladbar.");
  });
});

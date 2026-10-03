// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BestandBereich } from "./bestand-bereich";

const antwort = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const karte = {
  id: "e1",
  name: "Bogenhanf",
  artName: "Bogenhanf",
  status: "pflanze",
  standort: null,
  lichtzone: null,
  gefangenAm: "2026-10-03",
  foto: null,
  letzteMessung: null,
  behandlung: null,
  weitereBehandlungen: 0,
};
const leereAnsicht = {
  exemplarId: "e1",
  wachstumsmass: null,
  messungen: [],
  letzte: null,
  letzteBewertung: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-01 Bestand verdrahtet mit Messen", () => {
  it("US-WAC-01 Messen am Exemplar öffnet die Messansicht, Zurück führt zum Bestand", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/standorte") return antwort(200, { standorte: [] });
        if (pfad === "/exemplare/e1/messungen") return antwort(200, leereAnsicht);
        return antwort(200, { karten: [karte] });
      }),
    );
    render(
      <BestandBereich
        api="http://api"
        token={async () => "tok"}
        neueArt={null}
        onArtWaehlen={() => {}}
        onAbgeschlossen={() => {}}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Messen: Bogenhanf" }));
    expect(await screen.findByRole("heading", { name: "Messen: Bogenhanf" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zum Bestand" }));
    expect(await screen.findByRole("heading", { name: "Bestand" })).toBeTruthy();
  });
});

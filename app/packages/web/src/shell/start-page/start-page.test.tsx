// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartPage } from "./start-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ZONE = { id: "z1", name: "Lampe 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 };
const LOCATION = { id: "s1", name: "Fensterbank", lightZoneId: "z1", kind: "indoor" };

interface World {
  zones: unknown[];
  locations: unknown[];
  cards: unknown[];
  archived?: number;
}

function fakeServer(w: World) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if ((init?.method ?? "GET") !== "GET") return response(404, {});
      if (path === "/light-zones") return response(200, { zones: w.zones });
      if (path === "/locations") return response(200, { locations: w.locations });
      if (path === "/hints") return response(200, { hints: [] });
      if (path === "/specimens/count")
        return response(200, { count: w.cards.length, archived: w.archived ?? 0 });
      if (path === "/specimens/cards") return response(500, {});
      return response(404, {});
    }),
  );
}

const open = vi.fn();
const view = () =>
  render(<StartPage api="http://api" token={token} accountId="a1" onOpen={open} />);

beforeEach(() => {
  open.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-03 start page and guided onboarding", () => {
  it("US-ACC-03 a new account is guided: first step asks for locations, with skip", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    expect(await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeTruthy();
    expect(screen.getByText("Schritt 1 von 3: Standorte")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Überspringen" })).toBeTruthy();
  });

  it("US-ACC-03 every step can be skipped; afterwards the start page shows hints and the next action, no error", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Wie hell ist es?" })).toBeTruthy();
    expect(screen.getByText("Schritt 2 von 3: Lichtzonen")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    expect(screen.getByText("Schritt 3 von 3: Erste Pflanze")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));

    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Du hast noch keinen Standort angelegt.")).toBeTruthy();
    expect(screen.getByText("Du hast noch keine Lichtzonen.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-ACC-03 after skipping the last step the guide does not come back when the start tab is opened again", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [] });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    cleanup();
    view();
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Deine erste Pflanze" })).toBeNull();
  });

  it("US-ACC-03 the first plant step leads to the catalog", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [] });
    view();
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-ACC-03 ending the onboarding is remembered per account on this device", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Einstieg beenden" }));
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    cleanup();
    view();
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeNull();
  });

  it("US-ACC-03 without a plant the start page shows a clear next action instead of an empty page", async () => {
    window.localStorage.setItem("pflanzendex.onboarding-skipped.a1", "1");
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [] });
    view();
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.getByText(/Wähle im Katalog eine Art/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Art im Katalog wählen" })).toBeTruthy();
  });

  it("US-ACC-03 with a plant and full setup the start page is usable and points to the collection", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [{ id: "e1" }] });
    view();
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-ACC-03 with a plant but skipped details the hints stay, each leads to the place that fixes it", async () => {
    fakeServer({ zones: [], locations: [], cards: [{ id: "e1" }] });
    view();
    expect(await screen.findByText("Du hast noch keinen Standort angelegt.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Standorte anlegen" }));
    expect(open).toHaveBeenCalledWith("light");
    await userEvent.click(screen.getByRole("button", { name: "Lichtzonen einrichten" }));
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("US-ACC-03 a load error is shown with a retry, never a blank start page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    view();
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-ACC-03 focus moves to the heading of the new step and the step is announced politely", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    const heading = await screen.findByRole("heading", { name: "Wie hell ist es?" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    const marker = screen.getByText("Schritt 2 von 3: Lichtzonen");
    expect(marker.getAttribute("role")).toBe("status");
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(document.activeElement).toBe(
      await screen.findByRole("heading", { name: "Deine erste Pflanze" }),
    );
  });

  it("US-ACC-03 a wizard step shows a visible progress marker, not only an aria attribute", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    const marker = await screen.findByText("Schritt 1 von 3: Standorte");
    expect(marker.className).toMatch(/rounded-full.*border/);
  });

  it("US-ACC-03 the start page counts the specimens with the count route, it does not load the card list", async () => {
    fakeServer({ zones: [], locations: [], cards: [{ id: "e1" }] });
    view();
    await screen.findByRole("heading", { name: "Start" });
    const paths = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(
      ([u]) => new URL(String(u)).pathname,
    );
    expect(paths).toContain("/specimens/count");
    expect(paths).not.toContain("/specimens/cards");
  });

  it("US-ACC-03 the guide and the overview both have exactly one h1, the steps are h2", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Start",
    ]);
    expect(screen.getByRole("heading", { name: "Wo stehen deine Pflanzen?" }).tagName).toBe("H2");
    await userEvent.click(screen.getByRole("button", { name: "Einstieg beenden" }));
    await screen.findByRole("heading", { name: "Start" });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Start",
    ]);
  });

  it("US-ACC-03 an account with only archived plants gets the start page with the next plant, not the guide (#291)", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [], archived: 2 });
    view();
    expect(await screen.findByRole("heading", { name: "Nächste Pflanze" })).toBeTruthy();
    expect(screen.queryByText("Schritt 1 von 3: Standorte")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-QS-09 every step names itself and its position, and the first step has no way back", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await screen.findByText("Schritt 1 von 3: Standorte");
    expect(screen.queryByRole("button", { name: "Zurück" })).toBeNull();
  });

  it("US-QS-09 going back leads to the previous step and keeps what the account already saved there (3.3.7)", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [] });
    view();
    // The guide starts at the first step without data, here the third.
    await screen.findByText("Schritt 3 von 3: Erste Pflanze");
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    const zones = await screen.findByRole("heading", { name: "Wie hell ist es?" });
    expect(screen.getByText("Schritt 2 von 3: Lichtzonen")).toBeTruthy();
    expect(document.activeElement).toBe(zones);
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" });
    // The location from before is shown, not asked for again.
    expect(await screen.findByText("Fensterbank")).toBeTruthy();
  });

  it("US-QS-07 the start page waits behind the PlantLoader with one loading status", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Start wird geladen …");
    expect(await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeTruthy();
    expect(screen.queryByText("Start wird geladen …")).toBeNull();
  });
});

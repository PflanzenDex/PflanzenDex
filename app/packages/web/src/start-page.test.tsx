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
      if (path === "/specimens/cards") return response(200, { cards: w.cards });
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
    expect(screen.getByText("Schritt 1 von 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Überspringen" })).toBeTruthy();
  });

  it("US-ACC-03 every step can be skipped; afterwards the start page shows hints and the next action, no error", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await userEvent.click(await screen.findByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Wie hell ist es?" })).toBeTruthy();
    expect(screen.getByText("Schritt 2 von 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    expect(screen.getByText("Schritt 3 von 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Überspringen" }));

    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Du hast noch keinen Standort angelegt.")).toBeTruthy();
    expect(screen.getByText("Du hast noch keine Lichtzonen.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-ACC-03 the first plant step leads to the catalog", async () => {
    fakeServer({ zones: [ZONE], locations: [LOCATION], cards: [] });
    view();
    expect(await screen.findByRole("heading", { name: "Deine erste Pflanze" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(open).toHaveBeenCalledWith("species");
  });

  it("US-ACC-03 skipping the whole onboarding is remembered per account on this device", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Einstieg später fortsetzen" }),
    );
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
    const fix = screen.getAllByRole("button", { name: "Zu Standorte und Licht" });
    await userEvent.click(fix[0] as HTMLElement);
    expect(open).toHaveBeenCalledWith("light");
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
    expect(screen.getByRole("button", { name: "Erneut laden" })).toBeTruthy();
  });

  it("US-ACC-03 a wizard step shows a visible progress marker, not only an aria attribute", async () => {
    fakeServer({ zones: [], locations: [], cards: [] });
    view();
    const marker = await screen.findByText("Schritt 1 von 3");
    expect(marker.className).toContain("onboarding-progress");
  });
});

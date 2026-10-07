// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/platform/announcer/announcer";
import { DiscoverArea } from "./discover-area";
import { DISCOVER_VIEW_KEY } from "./discover-view";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const empty = {
  deck: 1,
  suggestions: [],
  empty: {
    reason: "all_decided",
    text: "Keine neuen Vorschläge.",
    nextAction: "Schlage eine Art vor.",
  },
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/discover/suggestions") return response(200, empty);
      if (path === "/species") return response(200, { species: [] });
      return response(200, {});
    }),
  );
}

function Probe() {
  const l = useLocation();
  return <p data-testid="address">{l.pathname + l.search}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AnnouncerProvider>
        <DiscoverArea
          api="http://api"
          token={async () => "tok"}
          onChoose={() => {}}
          profileSection={() => null}
        />
        <Probe />
      </AnnouncerProvider>
    </MemoryRouter>,
  );

const radio = (name: string) => screen.getByRole("button", { name });
const checked = (name: string) => radio(name).getAttribute("aria-pressed") === "true";
const suggestionsShown = () => screen.findByText("Keine neuen Vorschläge.");
const catalogShown = () => screen.findByRole("heading", { level: 2, name: "Art wählen" });

beforeAll(async () => {
  await Promise.all([
    import("../../../../discover/discover-page/discover-page"),
    import("../../../../catalog/SpeciesPage"),
  ]);
}, 30_000);

beforeEach(() => {
  window.localStorage.clear();
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-QS-14 the destination Entdecken with its switch Vorschläge | Katalog", () => {
  it("US-QS-14 · US-ENT-01 without address and stored choice the suggestions show, under one heading Entdecken", async () => {
    renderAt("/discover");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Entdecken");
  });

  it("US-QS-14 · US-BES-01 the address with view=catalog shows the species catalog under the same single heading", async () => {
    renderAt("/discover?view=catalog");
    await catalogShown();
    expect(checked("Katalog")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Entdecken");
  });

  it("US-QS-14 the stored choice is used when the address has none", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "catalog");
    renderAt("/discover");
    await catalogShown();
    expect(checked("Katalog")).toBe(true);
  });

  it("US-QS-14 the address wins over the stored choice", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "catalog");
    renderAt("/discover?view=suggestions");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
  });

  it("US-QS-14 an unknown value in the address or in the storage falls back to the suggestions", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "unsinn");
    renderAt("/discover?view=unsinn");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
  });

  it("US-QS-14 a click on Katalog changes the address, remembers the choice, announces it and keeps the focus", async () => {
    renderAt("/discover");
    await suggestionsShown();
    await userEvent.click(radio("Katalog"));
    expect(screen.getByTestId("address").textContent).toBe("/discover?view=catalog");
    expect(window.localStorage.getItem(DISCOVER_VIEW_KEY)).toBe("catalog");
    await catalogShown();
    expect(document.activeElement).toBe(radio("Katalog"));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Katalog");
  });

  it("US-QS-14 the switch works from the keyboard and the focus stays on it", async () => {
    renderAt("/discover");
    await suggestionsShown();
    await userEvent.tab();
    expect(document.activeElement).toBe(radio("Vorschläge"));
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("address").textContent).toBe("/discover?view=catalog");
    await catalogShown();
    expect(document.activeElement).toBe(radio("Katalog"));
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");
    await suggestionsShown();
    expect(document.activeElement).toBe(radio("Vorschläge"));
  });

  it("US-QS-14 a failing storage neither breaks the switch nor the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt("/discover");
    await suggestionsShown();
    await act(async () => radio("Katalog").click());
    await waitFor(() => expect(checked("Katalog")).toBe(true));
    await catalogShown();
  });

  it("US-QS-14 the switch is a named group of two toggle buttons in the order Vorschläge, Katalog", async () => {
    renderAt("/discover");
    await suggestionsShown();
    const group = screen.getByRole("group", { name: "Ansicht von Entdecken" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Vorschläge",
      "Katalog",
    ]);
  });
});

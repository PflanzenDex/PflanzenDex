// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddPlant } from "./add-plant";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ZONES = [
  { id: "z2", name: "Zone 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 },
  { id: "z4", name: "Zone 4", luxCeiling: 60000, ppfd: null, sortOrder: 4 },
];
const LOCATIONS = [
  { id: "l1", name: "Zuhause", lightZoneId: null, kind: "indoor" },
  { id: "l2", name: "Balkon", lightZoneId: "z4", kind: "outdoor" },
];
const HIT = { id: "sp1", latinName: "Monstera deliciosa", germanName: "Fensterblatt" };
const SPECIES = { ...HIT, lightDemandLux: 12000, standardLevel: 2, softLeaf: false };
const CARDS = [
  { id: "e0", name: "A", speciesId: "x", location: "Zuhause", caughtAt: "2026-01-01" },
  { id: "e9", name: "B", speciesId: "y", location: "Balkon", caughtAt: "2026-05-01" },
];

const writes: { path: string; body: Record<string, unknown> }[] = [];
function server(
  cards: unknown[] = CARDS,
  zones: unknown[] = ZONES,
  locations: unknown[] = LOCATIONS,
) {
  writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        writes.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return response(201, { id: "e1", speciesId: "sp1" });
      }
      if (path === "/light-zones") return response(200, { zones });
      if (path === "/locations") return response(200, { locations });
      if (path === "/specimens/cards") return response(200, { cards });
      if (path === "/species") return response(200, { species: [HIT] });
      if (path === "/species/sp1") return response(200, SPECIES);
      return response(404, {});
    }),
  );
}
const get = async (url: string) => {
  const r = await fetch(url, { headers: { Authorization: "Bearer tok" } });
  return r.ok
    ? { ok: true as const, value: (await r.json()) as never }
    : { ok: false as const, error: { code: "server.error" } };
};
const LOOKUP = {
  search: async (api: string, _t: string, text: string) => {
    const r = await get(`${api}/species?q=${encodeURIComponent(text)}`);
    return r.ok ? { ok: true as const, value: (r.value as { species: never[] }).species } : r;
  },
  load: (api: string, _t: string, id: string) => get(`${api}/species/${id}`),
};
const onMore = vi.fn();
const view = () =>
  render(
    <MemoryRouter>
      <AddPlant
        lookup={LOOKUP}
        api="http://api"
        token={token}
        onCatalog={() => {}}
        onMore={onMore}
      />
    </MemoryRouter>,
  );
async function toSave() {
  await userEvent.type(await screen.findByLabelText("Name der Pflanze"), "Monstera");
  await userEvent.click(await screen.findByRole("button", { name: /Monstera deliciosa/ }));
  await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  onMore.mockClear();
});

describe("US-ONB-01 a further plant uses the two steps of the first plant (#896)", () => {
  it("US-ONB-01 the page is titled Pflanze anlegen and starts with the species search", async () => {
    server();
    view();
    expect(await screen.findByRole("heading", { level: 1, name: "Pflanze anlegen" })).toBeTruthy();
    expect(screen.getByText("Schritt 1 von 2: Art wählen")).toBeTruthy();
  });

  it("US-ONB-01 the place of the last plant is suggested with its light and sent only as shown", async () => {
    server();
    view();
    await toSave();
    const place = (await screen.findByLabelText("Standort")) as HTMLSelectElement;
    expect(await screen.findByRole("option", { name: "Balkon (Zone 4)" })).toBeTruthy();
    expect(place.value).toBe("l2");
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    const body = writes.find((w) => w.path === "/specimens")?.body;
    expect(body?.["locationId"]).toBe("l2");
    expect(body).not.toHaveProperty("lightZoneId");
  });

  it("US-ONB-01 choosing Keiner stores no place, nothing is saved unseen", async () => {
    server();
    view();
    await toSave();
    await userEvent.selectOptions(await screen.findByLabelText("Standort"), "");
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    await screen.findByRole("heading", { name: /ist angelegt/ });
    expect(writes.find((w) => w.path === "/specimens")?.body).not.toHaveProperty("locationId");
  });

  it("US-ONB-01 without a plant at a place nothing is suggested", async () => {
    server([]);
    view();
    await toSave();
    const place = (await screen.findByLabelText("Standort")) as HTMLSelectElement;
    expect(place.value).toBe("");
  });

  it("US-ONB-01 Mehr Angaben opens the long form for the chosen species", async () => {
    server();
    view();
    await toSave();
    await userEvent.click(await screen.findByRole("button", { name: "Mehr Angaben" }));
    expect(onMore).toHaveBeenCalledWith(expect.objectContaining({ id: "sp1" }));
  });

  it("US-ONB-01 after saving, one more plant restarts at the search", async () => {
    server();
    view();
    await toSave();
    await userEvent.click(await screen.findByRole("button", { name: "Pflanze speichern" }));
    await userEvent.click(await screen.findByRole("button", { name: "Noch eine Pflanze" }));
    expect(await screen.findByLabelText("Name der Pflanze")).toBeTruthy();
  });
});

describe("US-ONB-01 · US-BES-04 the first-plant steps (issue 1045)", () => {
  it("US-ONB-01 a place under cutting light is no suggestion for a plant that is not a cutting", async () => {
    const cutting = {
      id: "z1",
      name: "Zone 1 · Stecklingslicht",
      luxCeiling: 1500,
      ppfd: null,
      sortOrder: 1,
    };
    const box = { id: "l3", name: "Stecklingsbox", lightZoneId: "z1", kind: "indoor" };
    server(
      [{ id: "e7", name: "C", speciesId: "x", location: "Stecklingsbox", caughtAt: "2026-09-01" }],
      [cutting, ...ZONES],
      [box, ...LOCATIONS],
    );
    view();
    await toSave();
    const place = (await screen.findByLabelText("Standort")) as HTMLSelectElement;
    expect(await screen.findByRole("option", { name: "Balkon (Zone 4)" })).toBeTruthy();
    expect(place.value).toBe("");
  });

  it("US-ONB-01 the chosen species is marked by a check mark and aria-pressed, not by colour alone", async () => {
    server();
    view();
    await userEvent.type(await screen.findByLabelText("Name der Pflanze"), "Monstera");
    const hit = await screen.findByRole("button", { name: /Monstera deliciosa/ });
    expect(hit.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(hit);
    expect(hit.getAttribute("aria-pressed")).toBe("true");
    expect(hit.querySelector("svg")).not.toBeNull();
  });
});

describe("US-QS-14 · US-ONB-01 Pflanze anlegen is a full-view page with one page header", () => {
  it("US-QS-14 has one h1 whose page header leads back to the Sammlung", () => {
    server();
    view();
    const title = screen.getByRole("heading", { level: 1, name: "Pflanze anlegen" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const header = title.closest("[data-page-header]") as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement)
        .getByRole("link", { name: "Zurück zur Sammlung" })
        .getAttribute("href"),
    ).toBe("/collection");
  });

  it("US-QS-14 the step's back is an outline button and 'Mehr Angaben' a ghost button, no filled grey one (ADR 0017)", async () => {
    server();
    view();
    await toSave();
    expect(screen.getByRole("button", { name: "Zurück" }).className).toContain("border-primary");
    const more = screen.getByRole("button", { name: "Mehr Angaben" }).className;
    expect(more).toContain("hover:bg-accent");
    expect(more).not.toContain("border-primary");
    expect(more).not.toContain("bg-secondary");
  });
});

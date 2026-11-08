// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import { AddPlant } from "./add-plant";
import { FeaturesProvider } from "@/shared/data";
import { answerCardRead } from "../../../collection/specimens/tests/cards-fake";

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
/** A refusal the server gives a write instead of saving it (its error code); `null` saves. */
type Refuse = (body: Record<string, unknown>) => { code: string } | null;

function server(
  cards: unknown[] = CARDS,
  zones: unknown[] = ZONES,
  locations: unknown[] = LOCATIONS,
  refuse: Refuse = () => null,
) {
  writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push({ path, body });
        const refused = refuse(body);
        if (refused) return response(409, { error: { code: refused.code, text: refused.code } });
        return response(201, { id: "e1", speciesId: "sp1" });
      }
      if (path === "/light-zones") return response(200, { zones });
      if (path === "/locations") return response(200, { locations });
      if (path.startsWith("/specimens/cards"))
        return answerCardRead(new URL(String(url)), cards as SpecimenCard[]) ?? response(404, {});
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

  it("US-QS-15 the page is one screen (DS-61): its frame marks the fit, so at a large text size only the content region scrolls", () => {
    server();
    view();
    const title = screen.getByRole("heading", { level: 1, name: "Pflanze anlegen" });
    expect(title.closest("[data-fit-screen]")).not.toBeNull();
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

const LEGACY_ZONES = [
  { id: "z2", name: "Lampe 2", luxCeiling: 15000, ppfd: null, sortOrder: 2 },
  { id: "z4", name: "Lampe 4", luxCeiling: 60000, ppfd: null, sortOrder: 4 },
];

describe("US-ONB-01 the derived light need names its zone the plain way (US-QS-24, issue 897)", () => {
  it("US-ONB-01 a zone stored under the old name Lampe n reads Zone n in the light need", async () => {
    server(CARDS, LEGACY_ZONES);
    view();
    await toSave();
    const field = await screen.findByRole("combobox", { name: "Lichtbedarf" });
    expect(within(field).getByRole("option", { name: /^Zone \d \(laut Art\)$/ })).toBeTruthy();
    expect(within(field).queryByText(/Lampe/)).toBeNull();
  });
});

describe("US-BES-18 the entry Aus Datei importieren sits where plants are added", () => {
  it("US-BES-18 the first step of Pflanze anlegen offers the import as a link to its page while the keeper switch is on", async () => {
    server();
    view();
    const link = await screen.findByRole("link", { name: "Aus Datei importieren" });
    expect(link.getAttribute("href")).toBe("/collection/import");
  });

  it("US-BES-18 with the keeper switch csv_import off the entry is hidden", async () => {
    server();
    render(
      <MemoryRouter>
        <FeaturesProvider features={{ csv_import: false }}>
          <AddPlant
            lookup={LOOKUP}
            api="http://api"
            token={token}
            onCatalog={() => {}}
            onMore={onMore}
          />
        </FeaturesProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: "Pflanze anlegen" });
    expect(screen.queryByRole("link", { name: "Aus Datei importieren" })).toBeNull();
  });

  it("US-BES-18 the entry leaves the screen once a species is chosen, so the save step has one way on", async () => {
    server();
    view();
    await toSave();
    await screen.findByText("Schritt 2 von 2: Pflanze speichern");
    expect(screen.queryByRole("link", { name: "Aus Datei importieren" })).toBeNull();
  });
});

/** The save button of the step is enabled once the zones and the plants of the species are read. */
async function untilSaveEnabled() {
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Pflanze speichern" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}

// A plant of the chosen species that the keeper already has (US-BES-03): one plant needs a marker from the second on.
const OWNED = [
  {
    id: "e5",
    name: "Monstera deliciosa",
    speciesId: "sp1",
    location: "Zuhause",
    caughtAt: "2026-02-01",
    marker: null,
  },
];
// The marker of the new plant is required by the server when none is sent and a plant of the species exists.
const noMarkerWhenOwned: Refuse = (body) =>
  body["marker"] === undefined ? { code: "specimen.marker_required" } : null;
const REFUSED_MARKER_TEXT =
  "Du hast schon eine Pflanze dieser Art. Gib der neuen ein Kennzeichen, damit du die Töpfe unterscheiden kannst.";

describe("US-BES-03 · US-QS-15 the marker of a further plant in the short form (issue 1638)", () => {
  it("US-BES-03 · US-ONB-01 an owned species shows the marker field preset as in the long form and saves with it", async () => {
    server(OWNED);
    view();
    await toSave();
    const marker = (await screen.findByLabelText("Kennzeichen")) as HTMLInputElement;
    expect(marker.value).toBe("Klammer");
    await untilSaveEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    expect(writes.find((w) => w.path === "/specimens")?.body).toMatchObject({ marker: "Klammer" });
  });

  it("US-BES-03 · US-ONB-01 a species the keeper does not own shows no marker field", async () => {
    server();
    view();
    await toSave();
    await screen.findByText("Schritt 2 von 2: Pflanze speichern");
    await untilSaveEnabled();
    expect(screen.queryByLabelText(/Kennzeichen/)).toBeNull();
  });

  it("US-QS-15 · US-BES-03 a cleared marker is refused: the field takes the focus and the text says what to do", async () => {
    server(OWNED, ZONES, LOCATIONS, noMarkerWhenOwned);
    view();
    await toSave();
    const marker = await screen.findByLabelText("Kennzeichen");
    await userEvent.clear(marker);
    await untilSaveEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    expect(await screen.findByText(REFUSED_MARKER_TEXT)).toBeTruthy();
    expect(document.activeElement).toBe(marker);
    expect(screen.queryByRole("heading", { name: /ist angelegt/ })).toBeNull();
  });

  it("US-QS-15 · US-BES-03 a refused marker the form did not show appears, takes the focus, and the next save with it goes through", async () => {
    // The plants read before were stale: the server knows a plant of the species, the form does not.
    server(CARDS, ZONES, LOCATIONS, noMarkerWhenOwned);
    view();
    await toSave();
    await untilSaveEnabled();
    expect(screen.queryByLabelText("Kennzeichen")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    const marker = await screen.findByLabelText("Kennzeichen");
    expect(await screen.findByText(REFUSED_MARKER_TEXT)).toBeTruthy();
    expect(document.activeElement).toBe(marker);
    await userEvent.type(marker, "Blau");
    await userEvent.click(screen.getByRole("button", { name: "Pflanze speichern" }));
    expect(await screen.findByRole("heading", { name: /ist angelegt/ })).toBeTruthy();
    expect(writes.at(-1)?.body).toMatchObject({ marker: "Blau" });
  });

  it("US-BES-03 · US-ONB-01 the third plant asks for the markers the other plants still miss", async () => {
    server([
      {
        id: "e5",
        name: "Alt",
        speciesId: "sp1",
        location: "Zuhause",
        caughtAt: "2026-02-01",
        marker: null,
      },
      {
        id: "e6",
        name: "Neu",
        speciesId: "sp1",
        location: "Balkon",
        caughtAt: "2026-03-01",
        marker: "Rot",
      },
    ]);
    view();
    await toSave();
    expect(await screen.findByLabelText("Kennzeichen für „Alt“")).toBeTruthy();
    expect(screen.getByLabelText("Kennzeichen")).toBeTruthy();
  });
});

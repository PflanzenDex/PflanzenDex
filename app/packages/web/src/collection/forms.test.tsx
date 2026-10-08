// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpecimenCard } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareProfileSection } from "./care-profile-page/care-profile-page";
import { CollectionPage } from "./collection-page/collection-page";
import { DifficultyPage } from "./difficulty-page/difficulty-page";
import { HintsPage } from "./hints-page/hints-page";
import { EMPTY_DISTRIBUTION } from "./distribution-test-helpers";

// DS-48 migration of the module (issue 318): invalid submissions focus the first invalid field and link the German
// message by aria-describedby, every page has a skeleton while loading, every empty view offers a next action.
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const species = { id: "a1", latinName: "Dracaena trifasciata", germanName: "Bogenhanf" } as Species;
const card = (id: string, marker: string | null): SpecimenCard => ({
  id,
  name: marker ? `Bogenhanf – ${marker}` : "Bogenhanf",
  speciesId: "a1",
  marker,
  speciesName: "Bogenhanf",
  status: "plant",
  location: null,
  lightZone: null,
  caughtAt: "2026-10-03",
  photo: null,
  lastMeasurement: null,
  treatment: null,
  moreTreatments: 0,
});

function fakeServer(cards: SpecimenCard[]) {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") {
        posts.push(path);
        return response(200, { id: "e1", name: "x" });
      }
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      return response(200, { cards });
    }),
  );
  return posts;
}
const page = (newSpecies: Species | null = null) => (
  <CollectionPage
    api="http://api"
    token={async () => "tok"}
    newSpecies={newSpecies}
    onSpeciesChoose={vi.fn()}
    onCompleted={vi.fn()}
  />
);
const describedText = (field: HTMLElement) =>
  (field.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-03 DS-48 invalid submission of the marker", () => {
  it("US-BES-03 the create form focuses the empty marker and links the German message", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page(species));
    const marker = await screen.findByLabelText("Kennzeichen");
    await userEvent.clear(marker);
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await waitFor(() => expect(document.activeElement).toBe(marker));
    expect(marker.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(marker)).toContain("Bitte gib ein Kennzeichen an");
    expect(posts).toHaveLength(0);
  });

  it("US-BES-03 the create form focuses the first missing marker of an existing specimen", async () => {
    const posts = fakeServer([card("e1", null), card("e2", "Klammer")]);
    render(page(species));
    const missing = await screen.findByLabelText("Kennzeichen für „Bogenhanf“");
    await userEvent.type(screen.getByLabelText("Kennzeichen"), "rot");
    await userEvent.click(screen.getByRole("button", { name: "Exemplar anlegen" }));
    await waitFor(() => expect(document.activeElement).toBe(missing));
    expect(describedText(missing)).toContain("fehlenden Kennzeichen");
    expect(posts).toHaveLength(0);
  });

  it("US-BES-03 the marker form focuses the empty marker and links the German message", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page());
    await userEvent.click(
      await screen.findByRole("button", { name: "Kennzeichen ändern: Bogenhanf" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Kennzeichen speichern" }));
    const marker = screen.getByLabelText("Kennzeichen");
    await waitFor(() => expect(document.activeElement).toBe(marker));
    expect(marker.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(marker)).toContain("Bitte gib ein Kennzeichen an");
    expect(posts).toHaveLength(0);
  });
});

describe("US-BES-07 DS-48 invalid submission of the archive reason", () => {
  it("US-BES-07 an own reason left empty focuses its field and links the German message", async () => {
    const posts = fakeServer([card("e1", null)]);
    render(page());
    await userEvent.click(await screen.findByRole("button", { name: "Archivieren: Bogenhanf" }));
    await userEvent.selectOptions(await screen.findByLabelText("Grund"), "other");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    const own = screen.getByLabelText("Eigener Grund");
    await waitFor(() => expect(document.activeElement).toBe(own));
    expect(own.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(own)).toContain("Bitte nenne einen Grund");
    expect(posts).toHaveLength(0);
  });
});

describe("US-BES-02 DS-52 skeletons mirror the pages while they load", () => {
  const pending = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
  const token = async () => "tok";
  const views: [string, () => React.ReactElement][] = [
    ["collection", () => page()],
    ["hints", () => <HintsPage api="http://api" token={token} onOpen={vi.fn()} />],
    ["difficulty", () => <DifficultyPage api="http://api" token={token} />],
    [
      "care profile section",
      () => <CareProfileSection api="http://api" token={token} speciesId="s1" />,
    ],
  ];
  it.each(views)(
    "US-BES-02 the %s page shows placeholder blocks inside the one status",
    async (_name, view) => {
      pending();
      render(view());
      const status = await screen.findByRole("status");
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(status.textContent).toContain("geladen");
      expect(status.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(2);
    },
  );
});

describe("US-BES-08 DS-26 an empty view offers the next action", () => {
  it("US-BES-08 without hints the empty state leads to the collection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) =>
        new URL(String(url)).pathname === "/locations"
          ? response(200, { locations: [] })
          : response(200, { hints: [] }),
      ),
    );
    const open = vi.fn();
    render(<HintsPage api="http://api" token={async () => "tok"} onOpen={open} />);
    expect(await screen.findByText(/Keine Hinweise/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zum Bestand" }));
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-BES-06 without specimens the empty state offers the species choice once", async () => {
    fakeServer([]);
    const choose = vi.fn();
    render(
      <CollectionPage
        api="http://api"
        token={async () => "tok"}
        newSpecies={null}
        onSpeciesChoose={choose}
        onCompleted={vi.fn()}
      />,
    );
    await screen.findByText(/Du hast noch kein Exemplar/);
    await userEvent.click(screen.getByRole("button", { name: "Art wählen" }));
    expect(choose).toHaveBeenCalledTimes(1);
  });
});

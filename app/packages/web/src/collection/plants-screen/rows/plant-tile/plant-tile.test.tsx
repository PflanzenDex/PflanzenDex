// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import { PlantTile } from "./plant-tile";

afterEach(cleanup);

const card = {
  id: "s1",
  name: "Aloe",
  photo: null,
  lightZone: null,
  treatment: null,
  lastMeasurement: null,
} as unknown as SpecimenCard;

describe("US-QS-19 a plant tile without a photo (issue 1045)", () => {
  it("US-QS-19 the initial sits on the tile, without a second box that reads as a double border", () => {
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={card} access={{} as never} />
      </MemoryRouter>,
    );
    const initial = container.querySelector("[data-initial]");
    expect(initial?.getAttribute("data-initial")).toBe("A");
    expect(initial?.className).not.toContain("bg-muted");
    expect(screen.getByRole("button", { name: /Aloe/ })).toBeTruthy();
  });
});

describe("US-QS-19 a plant tile in two columns at 360 px (issue 1108)", () => {
  it("US-QS-19 name and zone keep one line each and end in an ellipsis, never breaking inside a word; the full name stays the name of the tile", () => {
    const long = { ...card, name: "Philodendron hederaceum Brasil" } as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={long} access={{} as never} />
      </MemoryRouter>,
    );
    const tile = screen.getByRole("button", { name: /Philodendron hederaceum Brasil/ });
    const name = screen.getByText("Philodendron hederaceum Brasil");
    const zone = screen.getByText("unbekannt", { selector: "span.text-muted-foreground" });
    for (const line of [name, zone]) {
      expect(line.className).toContain("truncate");
      expect(line.className).not.toMatch(/overflow-wrap|break-/);
    }
    expect(tile.className).toContain("py-1.5");
  });
});

describe("US-QS-19 the marker of a plant tile on its own line (issue 1651)", () => {
  it("US-QS-19 a tile with a marker shows the species and the marker as two one-line elements, the marker below the species", () => {
    const marked = { ...card, name: "Efeutute – Ableger", marker: "Ableger" } as SpecimenCard;
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={marked} access={{} as never} />
      </MemoryRouter>,
    );
    const species = screen.getByText("Efeutute");
    const marker = container.querySelector("[data-marker]");
    if (!marker) throw new Error("the tile has no marker line");
    expect(marker.textContent).toContain("Ableger");
    expect(marker).not.toBe(species);
    expect(species.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const line of [species, marker]) {
      expect(line.className).toContain("truncate");
      expect(line.className).not.toMatch(/overflow-wrap|break-/);
    }
  });

  it("US-QS-19 the accessible name of a tile with a marker is its visible text and holds the full name (WCAG 2.5.3, issue 1651)", () => {
    const marked = {
      ...card,
      name: "Efeutute – Ableger",
      marker: "Ableger",
      lastMeasurement: { quality: "healthy", date: "2026-10-01", value: 24, note: null },
    } as unknown as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={marked} access={{} as never} />
      </MemoryRouter>,
    );
    const tile = screen.getByRole("button", { name: "Efeutute – Ableger unbekannt Gesund" });
    expect(tile.hasAttribute("aria-label")).toBe(false);
  });

  it("US-QS-19 a tile without a marker shows no empty marker line, so it keeps its height (issue 1651)", () => {
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={card} access={{} as never} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-marker]")).toBeNull();
    expect(screen.getByRole("button", { name: "Aloe unbekannt unbekannt" })).toBeTruthy();
  });

  it("US-QS-19 a marker that the name does not carry still gets its own line, so nothing disappears (P-10)", () => {
    const odd = { ...card, name: "Efeutute", marker: "Ableger" } as SpecimenCard;
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={odd} access={{} as never} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Efeutute")).toBeTruthy();
    expect(container.querySelector("[data-marker]")?.textContent).toContain("Ableger");
  });
});

describe("NFR-12 a plant tile asks the thumbnail of its photo", () => {
  it("NFR-12 the tile requests size=thumb and shows the picture it gets back", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        requested.push(String(url));
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array([1])]),
        } as Response;
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:tile");
    const withPhoto = {
      ...card,
      photo: { url: "/specimens/s1/measurements/m1/photo", date: "2026-10-01" },
    } as unknown as SpecimenCard;
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={withPhoto} access={{ api: "http://api", token: async () => "tok" }} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:tile"),
    );
    expect(requested).toEqual(["http://api/specimens/s1/measurements/m1/photo?size=thumb"]);
    vi.unstubAllGlobals();
  });
});

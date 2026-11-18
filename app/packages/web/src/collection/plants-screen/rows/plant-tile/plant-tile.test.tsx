// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpecimenCard } from "@pflanzendex/core";
import { PlantTile, tileLines } from "./plant-tile";

afterEach(cleanup);

const card = {
  id: "s1",
  name: "Aloe",
  speciesId: "sp1",
  speciesName: "Aloe",
  marker: null,
  photo: null,
  lightZone: null,
  treatment: null,
  lastMeasurement: null,
} as unknown as SpecimenCard;

/** Shows the address the row leads to, so a test can see that the plant's layer opened. */
function Where() {
  const at = useLocation();
  return <output data-testid="where">{at.search}</output>;
}

const noPhoto = { api: "http://api", token: async () => "tok" };

describe("US-QS-32 a plant row without a photo shows the drawn placeholder (SG-PHOTO-02)", () => {
  it("US-QS-32 the drawn placeholder stands in the thumbnail, not the bare letter of the name", () => {
    const { container } = render(
      <MemoryRouter>
        <PlantTile card={card} access={noPhoto} />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-initial]")).toBeNull();
    expect(container.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Aloe" })).toBeTruthy();
  });
});

describe("US-QS-32 a plant row: the name wraps to two lines, one meta line (SG-TYPE-05, SG-LIST-03)", () => {
  it("US-QS-32 a long name is clamped at two lines, not cut at one", () => {
    const long = {
      ...card,
      name: "Philodendron hederaceum Brasil",
      speciesName: "Philodendron hederaceum Brasil",
    } as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={long} access={noPhoto} />
      </MemoryRouter>,
    );
    const name = screen.getByText("Philodendron hederaceum Brasil");
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("truncate");
  });

  it("US-QS-32 the meta line of a plant is one line that truncates", () => {
    render(
      <MemoryRouter>
        <PlantTile card={card} access={noPhoto} />
      </MemoryRouter>,
    );
    const zone = screen.getByText("Lichtzone unbekannt");
    expect(zone.className).toContain("truncate");
  });
});

describe("US-QS-32 the title of a plant is its own name, the species is its meta line (owner answer Q-68)", () => {
  it("US-QS-32 a plant with a marker shows the marker as the title and the species in the meta line", () => {
    const marked = {
      ...card,
      name: "Efeutute – Ableger",
      marker: "Ableger",
      speciesName: "Efeutute",
    } as SpecimenCard;
    expect(tileLines(marked)).toEqual({ title: "Ableger", meta: "Efeutute · Lichtzone unbekannt" });
    render(
      <MemoryRouter>
        <PlantTile card={marked} access={noPhoto} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Ableger" })).toBeTruthy();
    expect(screen.getByText("Ableger")).toBeTruthy();
  });

  it("US-QS-32 a plant without its own name shows its species as the title and no species again (SG-LIST-07)", () => {
    expect(tileLines(card)).toEqual({ title: "Aloe", meta: "Lichtzone unbekannt" });
  });

  it("US-QS-32 the species of a marked plant comes from the name when the card has none (P-10)", () => {
    const odd = {
      ...card,
      name: "Efeutute – Ableger",
      marker: "Ableger",
      speciesName: null,
    } as SpecimenCard;
    expect(tileLines(odd).meta).toBe("Efeutute · Lichtzone unbekannt");
  });

  it("US-QS-32 a marker that the name does not carry still is the title, so nothing disappears (P-10)", () => {
    const odd = {
      ...card,
      name: "Efeutute",
      marker: "Ableger",
      speciesName: "Efeutute",
    } as SpecimenCard;
    expect(tileLines(odd).title).toBe("Ableger");
  });

  it("US-QS-32 the accessible name of a plant row is its title, the meta line describes it (WCAG 2.5.3)", () => {
    const marked = {
      ...card,
      name: "Efeutute – Ableger",
      marker: "Ableger",
      speciesName: "Efeutute",
    } as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={marked} access={noPhoto} />
      </MemoryRouter>,
    );
    const row = screen.getByRole("button", { name: "Ableger" });
    const described = (row.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" | ");
    expect(described).toBe("Efeutute · Lichtzone unbekannt");
  });
});

describe("US-QS-32 a plant row shows at most one trailing element: the attention state (SG-COLOR-04)", () => {
  it("US-QS-32 an open treatment is the trailing warning badge", () => {
    const due = {
      ...card,
      treatment: { reason: "Umtopfen", dueDate: { kind: "today", days: 0, text: "heute" } },
    } as unknown as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={due} access={noPhoto} />
      </MemoryRouter>,
    );
    const badge = screen.getByText("Behandeln");
    expect(badge.className).toContain("bg-warning");
  });

  it("US-QS-32 a healthy plant shows no trailing element, so the row stays one scan line", () => {
    const healthy = {
      ...card,
      lastMeasurement: { quality: "healthy", date: "2026-10-01", value: 24, note: null },
    } as unknown as SpecimenCard;
    render(
      <MemoryRouter>
        <PlantTile card={healthy} access={noPhoto} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Gesund")).toBeNull();
    expect(screen.getByRole("button", { name: "Aloe" })).toBeTruthy();
  });
});

describe("US-QS-32 choosing a plant row opens the plant in its layer (US-QS-19)", () => {
  it("US-QS-32 the row says it opens a dialog, and a tap sets the plant's layer in the address", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/collection?view=plants"]}>
        <PlantTile card={card} access={noPhoto} />
        <Where />
      </MemoryRouter>,
    );
    const row = screen.getByRole("button", { name: "Aloe" });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    await user.click(row);
    expect(screen.getByTestId("where").textContent).toContain("sheet=plant-s1");
  });
});

describe("NFR-12 a plant row asks the thumbnail of its photo", () => {
  it("NFR-12 the row requests size=thumb and shows the picture it gets back", async () => {
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

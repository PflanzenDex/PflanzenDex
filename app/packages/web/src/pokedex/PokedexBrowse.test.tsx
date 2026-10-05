// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PokedexPage } from "./PokedexPage";

const species = (name: string, extra: Record<string, unknown> = {}) => ({
  species: name,
  genus: name.split(" ")[0],
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  ...extra,
});
const moraceae = { familyLatin: "Moraceae", familyGerman: "Maulbeergewächse" };
const caught = [
  species("Ficus lyrata", {
    ...moraceae,
    germanName: "Geigenfeige",
    caughtDate: { date: "2026-03-05", source: "caught_at" },
  }),
  species("Ficus elastica", {
    ...moraceae,
    germanName: "Gummibaum",
    caughtDate: { date: "2026-08-01", source: "created_at" },
  }),
  species("Aloe vera", {
    germanName: "Echte Aloe",
    familyLatin: "Asphodelaceae",
    caughtDate: { date: null, source: "unknown" },
    genusSpeciesCount: 9,
  }),
];
const token = async () => "tok";
const open = async (list = caught) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ownership: { caught: list, unidentified: [] } }), {
          status: 200,
        }),
      ),
    ),
  );
  render(<PokedexPage api="http://api" token={token} />);
  await screen.findByRole("heading", { level: 1, name: "Pokédex" });
};
const shown = () =>
  screen.queryAllByRole("listitem").flatMap((li) => {
    const s = li.querySelector("[data-species]");
    return s ? [s.textContent] : [];
  });
const search = (text: string) =>
  userEvent.type(screen.getByRole("searchbox", { name: /Suche/ }), text);
const sortBy = (label: string) =>
  userEvent.selectOptions(screen.getByRole("combobox", { name: "Sortierung" }), label);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-POK-08 search", () => {
  it("US-POK-08 finds case-insensitively by species, German name, genus and family", async () => {
    await open();
    await search("GEIGEN");
    expect(shown()).toEqual(["Ficus lyrata"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: /Suche/ }));
    await search("asphodel");
    expect(shown()).toEqual(["Aloe vera"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: /Suche/ }));
    await search("ficus");
    expect(shown()).toEqual(["Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 without a hit it says 'Keine Art gefunden.' and offers the reset (P-09)", async () => {
    await open();
    await search("zzz");
    expect(screen.getByText("Keine Art gefunden.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Suche zurücksetzen" }));
    expect(shown()).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: /Suche/ }));
  });

  it("US-POK-08 shows how many species match", async () => {
    await open();
    await search("ficus");
    expect(screen.getByText("2 von 3 Arten")).toBeTruthy();
  });
});

describe("US-POK-08 filter", () => {
  it("US-POK-08 'Alle' and 'Gefangen' are available and the chosen one is marked", async () => {
    await open();
    const all = screen.getByRole("button", { name: "Alle" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    // The marker is a visible check mark, not only aria-pressed (US-POK-08, DS-19).
    expect(all.textContent).toContain("✓");
    await userEvent.click(screen.getByRole("button", { name: "Gefangen" }));
    expect(screen.getByRole("button", { name: "Gefangen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Gefangen" }).textContent).toContain("✓");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(all.textContent).not.toContain("✓");
    expect(shown()).toHaveLength(3);
  });

  it("US-POK-08 'Fehlend' is disabled with the reason: there is no catalog tree yet (P-08)", async () => {
    await open();
    expect((screen.getByRole("button", { name: "Fehlend" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByText(
        /Fehlende Arten zeigt der Pokédex erst, wenn der Artenkatalog aufgebaut ist/,
      ),
    ).toBeTruthy();
  });

  it("US-POK-08 the disabled filters point to their visible reason and show no internal story ID", async () => {
    await open([species("Ficus lyrata")]);
    for (const [name, id] of [
      ["Fehlend", "hint-missing"],
      ["Artenarm", "hint-poor"],
    ] as const) {
      const id2 = screen.getByRole("button", { name }).getAttribute("aria-describedby");
      expect(id2).toBe(id);
      expect(document.getElementById(id)?.textContent).toContain("nicht verfügbar");
    }
    expect(screen.queryByText(/US-POK/)).toBeNull();
  });

  it("US-POK-08 'Artenarm' is disabled while no genus species count is known, and works once one is", async () => {
    await open([species("Ficus lyrata")]);
    expect((screen.getByRole("button", { name: "Artenarm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Artenarm" }));
    expect(shown()).toEqual(["Aloe vera"]);
  });
});

describe("US-POK-08 sort", () => {
  it("US-POK-08 alphabetical is the default flat list", async () => {
    await open();
    expect(shown()).toEqual(["Aloe vera", "Ficus elastica", "Ficus lyrata"]);
  });

  it("US-POK-08 by catch date: newest first, without date last", async () => {
    await open();
    await sortBy("Fangdatum");
    expect(shown()).toEqual(["Ficus elastica", "Ficus lyrata", "Aloe vera"]);
  });

  it("US-POK-08 by species count: ascending, and it says the count is unknown for all (P-08)", async () => {
    await open([species("Ficus lyrata"), species("Aloe vera")]);
    await sortBy("Artenzahl");
    expect(shown()).toEqual(["Aloe vera", "Ficus lyrata"]);
    expect(screen.getByText(/Artenzahl der Gattungen ist noch unbekannt/)).toBeTruthy();
  });

  it("US-POK-08 by family: groups with 'n / unbekannt' that collapse and expand", async () => {
    await open();
    await sortBy("Familie");
    const moraceaeHeader = screen.getByRole("button", { name: /Moraceae/ });
    expect(moraceaeHeader.textContent).toContain("Maulbeergewächse");
    expect(moraceaeHeader.textContent).toContain("2 / unbekannt");
    expect(moraceaeHeader.getAttribute("aria-expanded")).toBe("true");
    expect(shown()).toEqual(["Aloe vera", "Ficus elastica", "Ficus lyrata"]);
    await userEvent.click(moraceaeHeader);
    expect(moraceaeHeader.getAttribute("aria-expanded")).toBe("false");
    expect(shown()).toEqual(["Aloe vera"]);
    await userEvent.click(moraceaeHeader);
    expect(shown()).toHaveLength(3);
  });

  it("US-POK-08 a species without a known family is grouped under 'Ohne bekannte Familie', last", async () => {
    await open([species("Citrus limon"), ...caught]);
    await sortBy("Familie");
    const headers = screen.getAllByRole("button", { name: /· \d/ }).map((b) => b.textContent);
    expect(headers.at(-1)).toContain("Ohne bekannte Familie");
    expect(screen.getByText("Citrus limon")).toBeTruthy();
  });
});

describe("US-POK-08 follow-ups of the family groups (issue 297)", () => {
  const detailCard = (name: string) => screen.getByRole("button", { name: `Details zu ${name}` });

  it("US-POK-08 a collapsed family group stays collapsed after the detail view was opened and closed", async () => {
    await open();
    await sortBy("Familie");
    await userEvent.click(screen.getByRole("button", { name: /Moraceae/ }));
    await userEvent.click(detailCard("Aloe vera"));
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.getByRole("button", { name: /Moraceae/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(
      screen.getByRole("button", { name: /Asphodelaceae/ }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(shown()).toEqual(["Aloe vera"]);
  });

  it("US-POK-08 closing the detail view restores the scroll position of the list", async () => {
    await open();
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const y = vi.spyOn(window, "scrollY", "get").mockReturnValue(420);
    await userEvent.click(detailCard("Aloe vera"));
    y.mockReturnValue(0);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 420));
    y.mockRestore();
  });

  it("US-POK-08 the group without a known family reads 'Ohne bekannte Familie' and does not say 'unbekannt' twice", async () => {
    await open([species("Citrus limon")]);
    await sortBy("Familie");
    const header = screen.getByRole("button", { name: /Ohne bekannte Familie/ });
    expect(header.textContent).toContain("1 Art");
    expect(header.textContent).not.toContain("unbekannt");
    expect(screen.queryByText(/Familie unbekannt/)).toBeNull();
  });
});

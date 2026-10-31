// @vitest-environment jsdom
import type { Suggestion } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SuggestionCard } from "./suggestion-card";

afterEach(cleanup);

const suggestion = (extra: Partial<Suggestion> = {}): Suggestion => ({
  species: "Aglaonema commutatum",
  germanName: null,
  summary: "Aglaonema commutatum is a species of flowering plant.",
  summaryLanguage: "en",
  family: "Araceae",
  lightZone: 3,
  difficulty: 1,
  imageUrl: null,
  sourceUrl: "https://en.wikipedia.org/wiki/Aglaonema_commutatum",
  attributes: {
    humidity: null,
    minTemperature: null,
    toxicToPets: null,
    growthSize: null,
    lightDescription: null,
  },
  reasons: ["Diese Art hast du noch nicht gefangen."],
  exploration: false,
  ...extra,
});
const show = (s: Suggestion) => render(<SuggestionCard suggestion={s} onSwipe={() => undefined} />);

describe("US-QS-21 the German name scales with the text size (issue 1019)", () => {
  it("US-QS-21 the German name is set in a rem size, not inherited, so 200 % text scales it with the title", () => {
    show(suggestion({ germanName: "Zebra-Haworthie" }));
    expect(screen.getByText("Zebra-Haworthie").className).toContain("text-base");
  });
});

describe("US-QS-14 difficulty stars have a text alternative", () => {
  it("US-QS-14 hides the stars and reads the level as text, without an aria-label on the dd", () => {
    show(suggestion({ difficulty: 2 }));
    const value = screen.getByText("Schwierigkeit").nextElementSibling;
    expect(value?.hasAttribute("aria-label")).toBe(false);
    expect(screen.getByText("★★☆").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("2 von 3").className).toContain("sr-only");
  });
});

describe("US-QS-14 language of the card texts (WCAG 3.1.2)", () => {
  it("US-QS-14 marks an English summary with lang=en and a visible hint", () => {
    show(suggestion());
    expect(screen.getByText(/is a species of flowering plant/).getAttribute("lang")).toBe("en");
    expect(screen.getByText("Text auf Englisch")).toBeTruthy();
  });

  it("US-QS-14 marks a German summary with lang=de and no hint", () => {
    show(suggestion({ summary: "Ein Text.", summaryLanguage: "de" }));
    expect(screen.getByText("Ein Text.").getAttribute("lang")).toBe("de");
    expect(screen.queryByText("Text auf Englisch")).toBeNull();
  });

  it("US-QS-14 claims no language when the data does not know it (P-08)", () => {
    show(suggestion({ summaryLanguage: null }));
    expect(screen.getByText(/is a species of flowering plant/).hasAttribute("lang")).toBe(false);
    expect(screen.queryByText("Text auf Englisch")).toBeNull();
  });
});

describe("US-QS-14 source link target", () => {
  it("US-QS-14 gives the source link a tap target of at least 44 px (min-h-11)", () => {
    show(suggestion());
    const link = screen.getByRole("link", { name: /Wikipedia \(CC BY-SA\)/ });
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("items-center");
  });
});

describe("US-QS-06 sources and licenses on the suggestion card (FR-POK-07)", () => {
  it("US-QS-06 links the source with the license statement", () => {
    show(suggestion());
    const link = screen.getByRole("link", { name: "Bild und Text: Wikipedia (CC BY-SA)" });
    expect(link.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Aglaonema_commutatum");
  });

  it("US-QS-06 Wikipedia text without a known source link still names source and license, without a link", () => {
    show(suggestion({ sourceUrl: null }));
    expect(screen.getByText("Bild und Text: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-QS-06 nothing from Wikipedia on the card: no attribution", () => {
    show(suggestion({ summary: null, imageUrl: null, sourceUrl: null }));
    expect(screen.queryByText(/Wikipedia/)).toBeNull();
  });
});

describe("US-ENT-06 exploration cards are marked", () => {
  it("US-ENT-06 marks an exploration card as something different, and a normal card not", () => {
    show(
      suggestion({
        exploration: true,
        reasons: ["Aus der Ordnung Cycadales hast du noch keine Art im Pokédex."],
      }),
    );
    expect(screen.getByText("Mal etwas anderes")).toBeTruthy();
    expect(screen.getByText(/Aus der Ordnung Cycadales/)).toBeTruthy();
    cleanup();
    show(suggestion());
    expect(screen.queryByText("Mal etwas anderes")).toBeNull();
  });
});

describe("US-ENT-09 attributes show their source", () => {
  it("US-ENT-09 shows a known value with source link, license, date and review status", () => {
    show(
      suggestion({
        attributes: {
          humidity: null,
          minTemperature: null,
          toxicToPets: null,
          growthSize: "small",
          lightDescription: null,
        },
        attributeSources: [
          {
            field: "growthSize",
            source: "wikidata",
            url: "https://www.wikidata.org/wiki/Q42",
            license: "CC0-1.0",
            retrievedAt: "2026-10-18",
            review: "unreviewed",
          },
        ],
      }),
    );
    expect(screen.getByText("Wuchsgröße").nextElementSibling?.textContent).toBe("klein");
    const list = screen.getByRole("list", { name: "Quellen der Merkmale" });
    expect(list.textContent).toContain("CC0-1.0, abgerufen am 18.10.2026), ungeprüft");
    expect(screen.getByRole("link", { name: "Wikidata" }).getAttribute("href")).toBe(
      "https://www.wikidata.org/wiki/Q42",
    );
  });

  it("US-ENT-09 shows the light statement as 'Licht laut Quelle' with source and 'ungeprüft'", () => {
    show(
      suggestion({
        attributes: { ...suggestion().attributes, lightDescription: "bright_indirect" },
        attributeSources: [
          {
            field: "lightDescription",
            source: "wikipedia",
            url: "https://en.wikipedia.org/w/index.php?title=X&oldid=1",
            license: "CC-BY-SA-4.0",
            retrievedAt: "2026-10-30",
            review: "unreviewed",
          },
        ],
      }),
    );
    expect(
      screen.getByText("Licht laut Quelle", { selector: "dt" }).nextElementSibling?.textContent,
    ).toBe("helles indirektes Licht");
    const list = screen.getByRole("list", { name: "Quellen der Merkmale" });
    expect(list.textContent).toContain("Licht laut Quelle: Wikipedia");
    expect(list.textContent).toContain("ungeprüft");
    // The Lichtzone comes from the species, never from the statement (P-08).
    expect(screen.getByText("Lichtzone").nextElementSibling?.textContent).toBe("Zone 3");
  });

  it("US-ENT-09 lists no source and keeps every attribute unknown without a stored fact (P-08)", () => {
    show(suggestion());
    expect(screen.queryByRole("list", { name: "Quellen der Merkmale" })).toBeNull();
    expect(screen.getAllByText("unbekannt")).toHaveLength(5);
  });
});

describe("US-QS-21 the card shows the essentials and opens the rest with Mehr", () => {
  it("US-QS-21 Mehr and Weniger toggle the facts, sources and reasons", async () => {
    show(suggestion());
    const toggle = screen.getByRole("button", { name: "Mehr" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Weniger" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});

// @vitest-environment jsdom
import type { CollectorCard as Card } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollectorCard } from "./collector-card";

afterEach(cleanup);

const card = (extra: Partial<Card> = {}): Card => ({
  number: 7,
  species: "Ficus benjamina",
  state: "missing",
  order: null,
  germanName: "Birkenfeige",
  germanNameFull: "Birkenfeige (Zimmerlinde)",
  summary: "Ein Baum.",
  summaryLanguage: "de",
  genus: "Ficus",
  genusSpeciesCount: 800,
  speciesPoor: false,
  difficulty: 2,
  lightZone: 3,
  imageUrl: "https://upload.example/ficus.jpg",
  sourceUrl: "https://de.wikipedia.org/wiki/Ficus_benjamina",
  family: "Moraceae",
  caughtDate: null,
  specimenCount: 0,
  natureRarity: { iucn: null, occurrences: null, threatened: false },
  appRarity: null,
  ...extra,
});
const show = (c: Card) => render(<CollectorCard card={c} />);

describe("US-POK-01 collector card", () => {
  it("US-POK-01 shows number, names, text, genus count, difficulty and light zone", () => {
    show(card());
    expect(screen.getByText("#007")).toBeTruthy();
    expect(screen.getByText("Ficus benjamina")).toBeTruthy();
    expect(screen.getByText("Birkenfeige").getAttribute("title")).toBe("Birkenfeige (Zimmerlinde)");
    expect(screen.getByText("Ein Baum.")).toBeTruthy();
    expect(screen.getByText("Gattung: 800 Arten")).toBeTruthy();
    expect(screen.getByText("★★☆").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Lichtzone 3")).toBeTruthy();
  });

  it("US-QS-14 the difficulty is plain text for screen readers, not an aria-label on a span", () => {
    show(card());
    expect(screen.getByText("Schwierigkeit 2 von 3").className).toContain("sr-only");
    expect(document.querySelector("span[aria-label]")).toBeNull();
  });

  it("US-POK-01 a missing card keeps name and text visible and says it is not caught yet", () => {
    show(card());
    expect(screen.getByText("noch nicht gefangen")).toBeTruthy();
    expect(screen.queryByText(/Exemplare/)).toBeNull();
  });

  it("US-POK-01 a caught card shows the catch chip and the number of specimens only above 1", () => {
    const caught = {
      state: "caught",
      caughtDate: { date: "2026-03-05", source: "caught_at" },
    } as const;
    const { rerender } = show(card({ ...caught, specimenCount: 1 }));
    expect(screen.getByText("gefangen 05.03.2026")).toBeTruthy();
    expect(screen.queryByText(/Exemplar/)).toBeNull();
    rerender(<CollectorCard card={card({ ...caught, specimenCount: 3 })} />);
    expect(screen.getByText("3 Exemplare")).toBeTruthy();
  });

  it("US-POK-01 without text it says that no description is available", () => {
    show(card({ summary: null }));
    expect(screen.getByText("Keine Beschreibung vorhanden.")).toBeTruthy();
  });

  it("US-POK-01 unknown values read 'unbekannt' instead of a number (P-08)", () => {
    show(card({ genusSpeciesCount: null, difficulty: null, lightZone: null, germanName: null }));
    expect(screen.getByText("Gattung: Artenzahl unbekannt")).toBeTruthy();
    expect(screen.getByText("Schwierigkeit unbekannt")).toBeTruthy();
    expect(screen.getByText("Lichtzone unbekannt")).toBeTruthy();
  });

  it("US-POK-01 links the image from its source and the source with its license", () => {
    show(card());
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://upload.example/ficus.jpg");
    const link = screen.getByRole("link", { name: /Quelle: Wikipedia/ });
    expect(link.getAttribute("href")).toBe("https://de.wikipedia.org/wiki/Ficus_benjamina");
    expect(link.textContent).toContain("CC BY-SA");
  });

  it("US-POK-01 without an image a neutral sprout stands in and without source there is no link", () => {
    show(card({ imageUrl: null, sourceUrl: null }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-POK-01 a species-poor genus gets the badge, a caught one also the rarity frame", () => {
    const { container, rerender } = show(card({ speciesPoor: true, genusSpeciesCount: 4 }));
    expect(screen.getByText("Artenarm")).toBeTruthy();
    expect(container.querySelector("[data-rarity]")).toBeNull();
    rerender(
      <CollectorCard card={card({ speciesPoor: true, genusSpeciesCount: 4, state: "caught" })} />,
    );
    expect(container.querySelector("[data-rarity]")).not.toBeNull();
  });
});

describe("US-QS-06 sources and licenses on the collector card (FR-POK-07)", () => {
  it("US-QS-06 Wikipedia text without a known source link still names source and license, without a link", () => {
    show(card({ imageUrl: null, sourceUrl: null }));
    expect(screen.getByText("Quelle: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-QS-06 a Wikipedia image without a known source link also names source and license", () => {
    show(card({ summary: null, sourceUrl: null }));
    expect(screen.getByText("Quelle: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
  });

  it("US-QS-06 nothing from Wikipedia on the card: no attribution", () => {
    show(card({ summary: null, imageUrl: null, sourceUrl: null }));
    expect(screen.queryByText(/Wikipedia/)).toBeNull();
  });
});

describe("US-POK-13 rarity in nature on the card", () => {
  const src = {
    url: "https://api.gbif.org/v1/species/42/iucnRedListCategory",
    retrievedAt: "2026-10-16T10:00:00.000Z",
  };

  it("US-POK-13 says unknown when no source gave a value (P-08)", () => {
    show(card());
    expect(screen.getByText("In der Natur: Gefährdung unbekannt")).toBeTruthy();
    expect(screen.getByText("In der Natur: Fundmeldungen unbekannt")).toBeTruthy();
    expect(screen.queryByText(/Hinweis/)).toBeNull();
  });

  it("US-POK-13 labels category and occurrence count 'in der Natur' with source link and retrieval date", () => {
    show(
      card({
        natureRarity: {
          iucn: { category: "VU", ...src },
          occurrences: {
            count: 1231,
            ...src,
            url: "https://api.gbif.org/v1/occurrence/count?taxonKey=42",
          },
          threatened: true,
        },
      }),
    );
    expect(screen.getByText("In der Natur: gefährdet (VU)")).toBeTruthy();
    expect(screen.getByText("In der Natur: 1.231 Fundmeldungen (GBIF)")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /Quelle: GBIF, abgerufen 16\.10\.2026/ });
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe(src.url);
  });

  it("US-POK-13 shows a neutral note for a threatened species and none for a safe one", () => {
    show(
      card({
        natureRarity: { iucn: { category: "LC", ...src }, occurrences: null, threatened: false },
      }),
    );
    expect(screen.getByText("In der Natur: nicht gefährdet (LC)")).toBeTruthy();
    expect(screen.queryByText(/Hinweis/)).toBeNull();
    cleanup();
    show(
      card({
        natureRarity: { iucn: { category: "EN", ...src }, occurrences: null, threatened: true },
      }),
    );
    expect(screen.getByText("Hinweis: Diese Art gilt in der Natur als bedroht.")).toBeTruthy();
  });

  it("US-POK-13 does not link a source that is not https", () => {
    show(
      card({
        natureRarity: {
          iucn: { category: "LC", ...src, url: "javascript:alert(1)" },
          occurrences: null,
          threatened: false,
        },
      }),
    );
    expect(screen.queryByRole("link", { name: /GBIF, abgerufen/ })).toBeNull();
  });
});

describe("US-POK-14 rarity in PflanzenDex on the card", () => {
  it("US-POK-14 says unknown when no account takes part", () => {
    show(card());
    expect(screen.getByText("In PflanzenDex: unbekannt (noch kein Konto nimmt teil)")).toBeTruthy();
  });

  it("US-POK-14 shows the share with its basis, labelled 'in PflanzenDex'", () => {
    show(card({ appRarity: { owners: 2, participants: 5, percent: 40 } }));
    expect(screen.getByText("In PflanzenDex: 40 % (2 von 5 Konten)")).toBeTruthy();
  });

  it("US-POK-14 rounds honestly at the edges and uses the singular for one account", () => {
    const texts = [
      [
        { owners: 1, participants: 300, percent: 0 },
        "In PflanzenDex: weniger als 1 % (1 von 300 Konten)",
      ],
      [
        { owners: 299, participants: 300, percent: 100 },
        "In PflanzenDex: mehr als 99 % (299 von 300 Konten)",
      ],
      [{ owners: 0, participants: 4, percent: 0 }, "In PflanzenDex: 0 % (0 von 4 Konten)"],
      [{ owners: 1, participants: 1, percent: 100 }, "In PflanzenDex: 100 % (1 von 1 Konto)"],
    ] as const;
    for (const [appRarity, text] of texts) {
      show(card({ appRarity }));
      expect(screen.getByText(text)).toBeTruthy();
      cleanup();
    }
  });
});

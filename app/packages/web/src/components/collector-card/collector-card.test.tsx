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
    expect(screen.getByLabelText("Schwierigkeit 2 von 3").textContent).toBe("★★☆");
    expect(screen.getByText("Lichtzone 3")).toBeTruthy();
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

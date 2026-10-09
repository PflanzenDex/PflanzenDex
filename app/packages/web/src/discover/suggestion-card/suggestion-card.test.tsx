// @vitest-environment jsdom
import type { Suggestion } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
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
  attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
  reasons: ["Diese Art hast du noch nicht gefangen."],
  ...extra,
});
const show = (s: Suggestion) => render(<SuggestionCard suggestion={s} onSwipe={() => undefined} />);

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

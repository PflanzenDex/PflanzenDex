// @vitest-environment jsdom
import type { CollectorCard } from "@pflanzendex/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CollectorCardsLayer } from "./collector-cards-layer";

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

const card = (extra: Partial<CollectorCard>): CollectorCard => ({
  number: 1,
  species: "Ficus benjamina",
  state: "caught",
  order: null,
  germanName: "Birkenfeige",
  germanNameFull: "Birkenfeige (Zimmerlinde)",
  summary: "Ein Baum.",
  summaryLanguage: "de",
  genus: "Ficus",
  genusSpeciesCount: 800,
  natureRarity: { iucn: null, occurrences: null, threatened: false },
  appRarity: null,
  speciesPoor: false,
  difficulty: 2,
  lightZone: 3,
  imageUrl: null,
  sourceUrl: "https://de.wikipedia.org/wiki/Ficus_benjamina",
  family: null,
  caughtDate: { date: "2026-03-12", source: "caught_at" },
  specimenCount: 1,
  ...extra,
});

function show(url = "/?sheet=cards") {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        cards: [card({}), card({ number: 2, species: "Ficus lyrata", germanName: "Geigenfeige" })],
      }),
    ),
  );
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CollectorCardsLayer
        id="cards"
        title="Sammlerkarten"
        api="http://api"
        token={async () => "t"}
      />
    </MemoryRouter>,
  );
}

const open = async (name: string) => {
  await userEvent.click(await screen.findByRole("button", { name: `Mehr: ${name}` }));
};

describe("US-QS-15 · SG-SHEET-03 · d-163 Mehr in the layer Sammlerkarten replaces its content, it opens no second sheet", () => {
  it("US-QS-15 · SG-SHEET-03 the layer shows the cards on a card row, titled Sammlerkarten", async () => {
    show();
    const layer = await screen.findByRole("dialog", { name: "Sammlerkarten" });
    expect(within(layer).getAllByRole("button", { name: /^Mehr: / })).toHaveLength(2);
  });

  it("US-QS-15 · SG-SHEET-03 'Mehr' puts the card details into the same sheet: one dialog, titled with the card name, with its sections", async () => {
    show();
    await open("Birkenfeige");
    const layer = await screen.findByRole("dialog", { name: "Birkenfeige" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const names = within(layer)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(["Beschreibung", "Merkmale", "Quellen"]);
    // The cards are gone from the sheet, not hidden behind it.
    expect(within(layer).queryByRole("region", { name: "Sammlerkarten nebeneinander" })).toBeNull();
  });

  it("US-QS-15 · SG-SHEET-03 the sheet has a back button 'Zurück zu den Karten' and the focus moves to it", async () => {
    show();
    await open("Birkenfeige");
    const back = await screen.findByRole("button", { name: "Zurück zu den Karten" });
    await waitFor(() => expect(document.activeElement).toBe(back));
  });

  it("US-QS-15 · SG-SHEET-03 · US-QS-08 back shows the cards again, the focus returns to the Mehr button of that card", async () => {
    show();
    await open("Geigenfeige");
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zu den Karten" }));
    expect(await screen.findByRole("dialog", { name: "Sammlerkarten" })).toBeTruthy();
    const more = await screen.findByRole("button", { name: "Mehr: Geigenfeige" });
    await waitFor(() => expect(document.activeElement).toBe(more));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("US-QS-15 · SG-SHEET-02 Escape closes the whole sheet, not only the details", async () => {
    show();
    await open("Birkenfeige");
    await screen.findByRole("dialog", { name: "Birkenfeige" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("US-QS-15 · SG-SHEET-02 'Schließen' closes the whole sheet, and a reopened layer shows the cards again, not the details", async () => {
    const { unmount } = show();
    await open("Birkenfeige");
    const layer = await screen.findByRole("dialog", { name: "Birkenfeige" });
    await userEvent.click(within(layer).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    unmount();
    cleanup();
    show();
    expect(await screen.findByRole("dialog", { name: "Sammlerkarten" })).toBeTruthy();
  });

  it("US-QS-15 · SG-SHEET-03 from 768 px the details replace the content of the dialog as well", async () => {
    setViewportWidth(800);
    show();
    await open("Birkenfeige");
    expect(await screen.findByRole("dialog", { name: "Birkenfeige" })).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

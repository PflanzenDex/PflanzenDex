// @vitest-environment jsdom
import type { CollectorCard as Card } from "@pflanzendex/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CollectorCard } from "./collector-card";

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

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

/** Opens the sheet of "Mehr" and returns it (US-QS-15, d-066); the name of the card is the German name, else the scientific one. */
async function showMore(c: Card = card()) {
  const view = show(c);
  const name = c.germanName ?? c.species;
  await userEvent.click(screen.getByRole("button", { name: `Mehr: ${name}` }));
  return { ...view, sheet: within(await screen.findByRole("dialog", { name })) };
}

describe("US-POK-01 collector card", () => {
  it("US-POK-01 · d-160 the front shows the number with the catch, the names, the light zone and the difficulty", () => {
    show(card());
    expect(screen.getByText("#007 · noch nicht gefangen")).toBeTruthy();
    expect(screen.getByText("Ficus benjamina")).toBeTruthy();
    expect(screen.getByText("Birkenfeige").getAttribute("title")).toBe("Birkenfeige (Zimmerlinde)");
    expect(screen.getByText("Lichtzone 3")).toBeTruthy();
    expect(screen.getByText("★★☆").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Mittel")).toBeTruthy();
  });

  it("US-QS-14 · US-QS-32 the difficulty is plain text for screen readers, not an aria-label on a span", () => {
    show(card());
    expect(screen.getByText("Schwierigkeit 2 von 3").className).toContain("sr-only");
    expect(document.querySelector("span[aria-label]")).toBeNull();
  });

  it("US-POK-01 · d-160 the front shows at most two facts, and no text, genus count, rarity line or source", () => {
    show(card({ natureRarity: { iucn: null, occurrences: null, threatened: true } }));
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Ein Baum.")).toBeNull();
    expect(screen.queryByText(/Gattung/)).toBeNull();
    expect(screen.queryByText(/In der Natur|In PflanzenDéx/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Quellen" })).toBeNull();
  });

  it("US-POK-01 · d-160 the front has no action but 'Mehr': the card is the one button of its front", () => {
    show(card());
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Mehr"]);
  });

  it("US-POK-01 the sheet shows the short text, the genus count and the scientific name above the sections", async () => {
    const { sheet } = await showMore();
    expect(sheet.getByText("Ein Baum.")).toBeTruthy();
    expect(sheet.getByText("Gattung: 800 Arten")).toBeTruthy();
    expect(sheet.getByText("Ficus benjamina").className).toContain("italic");
  });

  it("US-POK-01 · P-08 unknown values read 'unbekannt' instead of a number, on the front and in the sheet", async () => {
    const { sheet } = await showMore(
      card({ genusSpeciesCount: null, difficulty: null, lightZone: null, germanName: null }),
    );
    expect(screen.getByText("Lichtzone unbekannt")).toBeTruthy();
    expect(screen.getByText("Schwierigkeit unbekannt")).toBeTruthy();
    // Unknown lines fold into one line that opens them, with the next step (US-QS-24).
    expect(sheet.getByText("4 Angaben fehlen")).toBeTruthy();
    const fold = sheet.getByText("4 Angaben fehlen").closest("details") as HTMLElement;
    expect(fold.textContent).toContain("Gattung: Artenzahl unbekannt");
  });

  it("US-POK-01 a missing card keeps name and facts visible and says it is not caught yet", () => {
    show(card());
    expect(screen.getByText(/noch nicht gefangen/)).toBeTruthy();
    expect(screen.queryByText(/^\d+ Pflanzen$/)).toBeNull();
  });

  it("US-POK-01 · d-160 a caught card shows the number with the date as TT.MM.JJJJ (SG-FMT-01), the number of specimens only above 1 and in the sheet", async () => {
    const caught = {
      state: "caught",
      caughtDate: { date: "2026-03-12", source: "caught_at" },
    } as const;
    const { rerender } = show(card({ ...caught, specimenCount: 1 }));
    expect(screen.getByText("#007 · gefangen 12.03.2026")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mehr: Birkenfeige" }));
    expect(within(await screen.findByRole("dialog")).queryByText(/^\d+ Pflanzen?$/)).toBeNull();
    await userEvent.keyboard("{Escape}");
    rerender(<CollectorCard card={card({ ...caught, specimenCount: 3 })} />);
    await userEvent.click(screen.getByRole("button", { name: "Mehr: Birkenfeige" }));
    expect(within(await screen.findByRole("dialog")).getByText("3 Pflanzen")).toBeTruthy();
  });

  it("US-POK-07 a creation date reads 'gefangen ≈ …', and a caught card without a date still says it is caught (P-08)", () => {
    const { rerender } = show(
      card({ state: "caught", caughtDate: { date: "2026-03-05", source: "created_at" } }),
    );
    expect(screen.getByText("#007 · gefangen ≈ 05.03.2026")).toBeTruthy();
    rerender(
      <CollectorCard
        card={card({ state: "caught", caughtDate: { date: null, source: "unknown" } })}
      />,
    );
    expect(screen.getByText("#007 · gefangen, Datum unbekannt")).toBeTruthy();
  });

  it("US-POK-01 without text the sheet says that no description is available", async () => {
    const { sheet } = await showMore(card({ summary: null }));
    expect(sheet.getByText("Keine Beschreibung vorhanden.")).toBeTruthy();
  });

  it("US-POK-01 links the image from its source, with the license in the credit under it", () => {
    show(card());
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://upload.example/ficus.jpg");
    const link = screen.getByRole("link", { name: /^Bild: Wikipedia/ });
    expect(link.getAttribute("href")).toBe("https://de.wikipedia.org/wiki/Ficus_benjamina");
    expect(link.textContent).toContain("CC BY-SA");
  });

  it("US-POK-01 without an image the drawn placeholder stands in and without source there is no link on the front", () => {
    show(card({ imageUrl: null, sourceUrl: null }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-POK-01 a species-poor genus gets the badge in the sheet, a caught one also the rarity frame on the card", async () => {
    const { container, sheet, rerender } = await showMore(
      card({ speciesPoor: true, genusSpeciesCount: 4 }),
    );
    expect(sheet.getByText("Artenarm")).toBeTruthy();
    expect(container.querySelector("[data-rarity]")).toBeNull();
    await userEvent.keyboard("{Escape}");
    rerender(
      <CollectorCard card={card({ speciesPoor: true, genusSpeciesCount: 4, state: "caught" })} />,
    );
    expect(container.querySelector("[data-rarity]")).not.toBeNull();
  });
});

describe("US-QS-15 · US-QS-32 · d-066 the collector card opens its details behind Mehr", () => {
  it("US-QS-15 · US-QS-32 'Mehr' is named 'Mehr: {name}' and opens a sheet titled with the card name", async () => {
    show(card());
    const button = screen.getByRole("button", { name: "Mehr: Birkenfeige" });
    expect(button.textContent).toBe("Mehr");
    await userEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "Birkenfeige" })).toBeTruthy();
  });

  it("US-QS-15 without a German name the sheet is titled with the scientific name", async () => {
    const { sheet } = await showMore(card({ germanName: null, germanNameFull: null }));
    expect(sheet.getByRole("heading", { name: "Ficus benjamina", level: 2 })).toBeTruthy();
  });

  it("US-QS-15 the sections of the sheet are Beschreibung, Merkmale and Quellen", async () => {
    const { sheet } = await showMore();
    expect(sheet.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Beschreibung",
      "Merkmale",
      "Quellen",
    ]);
  });

  it("US-QS-15 · US-QS-08 closing the sheet returns the focus to 'Mehr'", async () => {
    show(card());
    const button = screen.getByRole("button", { name: "Mehr: Birkenfeige" });
    await userEvent.click(button);
    const sheet = within(await screen.findByRole("dialog", { name: "Birkenfeige" }));
    await userEvent.click(sheet.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-15 · US-QS-32 the card has no scroll region of its own: the deck never scrolls", () => {
    const { container } = show(card());
    expect(
      container.querySelectorAll(
        '[class*="overflow-y-auto"], [class*="overflow-auto"], [data-scroll-region]',
      ),
    ).toHaveLength(0);
  });
});

describe("US-QS-15 · SG-SHEET-03 · d-163 a card inside a sheet hands Mehr to the sheet", () => {
  it("US-QS-15 · SG-SHEET-03 with onMore the button opens no sheet of its own and tells the card", async () => {
    const asked: string[] = [];
    render(<CollectorCard card={card()} onMore={(c) => asked.push(c.species)} />);
    const button = screen.getByRole("button", { name: "Mehr: Birkenfeige" });
    expect(button.textContent).toBe("Mehr");
    expect(button.hasAttribute("aria-haspopup")).toBe(false);
    await userEvent.click(button);
    expect(asked).toEqual(["Ficus benjamina"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-15 the card names its species for the way back (data-species)", () => {
    show(card());
    expect(screen.getByRole("article").getAttribute("data-species")).toBe("Ficus benjamina");
  });
});

describe("US-QS-06 sources and licenses on the collector card (FR-POK-07)", () => {
  it("US-QS-06 Wikipedia text without a known source link still names source and license in the sheet, without a link", async () => {
    const { sheet } = await showMore(card({ imageUrl: null, sourceUrl: null }));
    expect(sheet.getByText("Wikipedia (CC BY-SA)")).toBeTruthy();
    expect(sheet.getByText("Link unbekannt")).toBeTruthy();
    expect(sheet.queryByRole("link")).toBeNull();
  });

  it("US-QS-06 a Wikipedia image without a known source link also names source and license", () => {
    show(card({ summary: null, sourceUrl: null }));
    expect(screen.getByText("Bild: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
  });

  it("US-QS-06 nothing from Wikipedia on the card: no attribution", async () => {
    const { sheet } = await showMore(card({ summary: null, imageUrl: null, sourceUrl: null }));
    expect(screen.queryByText(/Wikipedia/)).toBeNull();
    expect(sheet.queryByText(/Wikipedia/)).toBeNull();
  });
});

describe("US-POK-13 rarity in nature on the card", () => {
  const src = {
    url: "https://api.gbif.org/v1/species/42/iucnRedListCategory",
    retrievedAt: "2026-10-16T10:00:00.000Z",
  };

  it("US-POK-13 says unknown when no source gave a value (P-08)", async () => {
    const { sheet } = await showMore();
    const fold = sheet.getByText(/Angaben fehlen/).closest("details") as HTMLElement;
    expect(fold.textContent).toContain("In der Natur: Gefährdung unbekannt");
    expect(fold.textContent).toContain("In der Natur: Fundmeldungen unbekannt");
    expect(sheet.queryByText(/Hinweis/)).toBeNull();
  });

  it("US-POK-13 labels category and occurrence count 'in der Natur'; their source and retrieval date are in the sources section", async () => {
    const { sheet } = await showMore(
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
    expect(sheet.getByText("In der Natur: gefährdet (VU)")).toBeTruthy();
    expect(sheet.getByText("In der Natur: 1.231 Fundmeldungen (GBIF)")).toBeTruthy();
    const row = sheet.getByRole("group", { name: "Quellen" });
    expect(within(row).getAllByRole("link", { name: "GBIF" })).toHaveLength(1);
    expect(row.textContent).toContain("abgerufen 16.10.2026");
  });

  it("US-POK-13 shows a neutral note for a threatened species and none for a safe one", async () => {
    const safe = await showMore(
      card({
        natureRarity: { iucn: { category: "LC", ...src }, occurrences: null, threatened: false },
      }),
    );
    expect(safe.sheet.getByText("In der Natur: nicht gefährdet (LC)")).toBeTruthy();
    expect(safe.sheet.queryByText(/Hinweis/)).toBeNull();
    cleanup();
    const threatened = await showMore(
      card({
        natureRarity: { iucn: { category: "EN", ...src }, occurrences: null, threatened: true },
      }),
    );
    expect(
      threatened.sheet.getByText("Hinweis: Diese Art gilt in der Natur als bedroht."),
    ).toBeTruthy();
  });

  it("US-POK-13 does not link a source that is not https: the sources section names it as text with its date", async () => {
    const { sheet } = await showMore(
      card({
        natureRarity: {
          iucn: { category: "LC", ...src, url: "javascript:alert(1)" },
          occurrences: null,
          threatened: false,
        },
      }),
    );
    expect(sheet.queryByRole("link", { name: "GBIF" })).toBeNull();
    const row = sheet.getByRole("group", { name: "Quellen" });
    expect(row.textContent).toContain("GBIF");
    expect(row.textContent).toContain("abgerufen 16.10.2026");
  });
});

describe("US-POK-14 rarity in PflanzenDex on the card", () => {
  it("US-POK-14 says unknown when no account takes part", async () => {
    const { sheet } = await showMore();
    const fold = sheet.getByText(/Angaben fehlen/).closest("details") as HTMLElement;
    expect(fold.textContent).toContain("In PflanzenDéx: unbekannt (noch kein Konto nimmt teil)");
  });

  it("US-POK-14 shows the share with its basis, labelled 'in PflanzenDex'", async () => {
    const { sheet } = await showMore(
      card({ appRarity: { owners: 2, participants: 5, percent: 40 } }),
    );
    expect(sheet.getByText("In PflanzenDéx: 40 % (2 von 5 Konten)")).toBeTruthy();
  });

  it("US-POK-14 rounds honestly at the edges and uses the singular for one account", async () => {
    const texts = [
      [
        { owners: 1, participants: 300, percent: 0 },
        "In PflanzenDéx: weniger als 1 % (1 von 300 Konten)",
      ],
      [
        { owners: 299, participants: 300, percent: 100 },
        "In PflanzenDéx: mehr als 99 % (299 von 300 Konten)",
      ],
      [{ owners: 0, participants: 4, percent: 0 }, "In PflanzenDéx: 0 % (0 von 4 Konten)"],
      [{ owners: 1, participants: 1, percent: 100 }, "In PflanzenDéx: 100 % (1 von 1 Konto)"],
    ] as const;
    for (const [appRarity, text] of texts) {
      const { sheet } = await showMore(card({ appRarity }));
      expect(sheet.getByText(text)).toBeTruthy();
      cleanup();
    }
  });
});

describe("US-QS-32 the collector card names a species the SG-TYPE-08 way", () => {
  it("US-QS-32 the German name leads, upright; the scientific name is italic on the line below", () => {
    show(card());
    const german = screen.getByText("Birkenfeige");
    expect(german.tagName).toBe("SPAN");
    expect(german.closest("i")).toBeNull();
    const latin = screen.getByText("Ficus benjamina");
    expect(latin.tagName).toBe("I");
    // The title comes first in the card, the scientific name after it.
    const order = german.compareDocumentPosition(latin);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("US-QS-32 the full German name stays the tooltip of the German title (US-POK-01)", () => {
    show(card());
    expect(screen.getByText("Birkenfeige").getAttribute("title")).toBe("Birkenfeige (Zimmerlinde)");
  });

  it("US-QS-32 without a German name the scientific name is the one italic title, not doubled", () => {
    const { container } = show(card({ germanName: null, germanNameFull: null }));
    expect(screen.getAllByText("Ficus benjamina")).toHaveLength(1);
    expect(screen.getByText("Ficus benjamina").tagName).toBe("I");
    expect(container.querySelector("[title]")?.textContent).not.toBe("Ficus benjamina");
  });
});

/** The GBIF values of a species as the API answers them: two rows, each with its own API address. */
const GBIF_URL = "https://api.gbif.org/v1/species/42/iucnRedListCategory";
const GBIF: Card["natureRarity"] = {
  iucn: { category: "VU", url: GBIF_URL, retrievedAt: "2026-10-16T10:00:00.000Z" },
  occurrences: {
    count: 1231,
    url: "https://api.gbif.org/v1/occurrence/count?taxonKey=42",
    retrievedAt: "2026-10-16T10:00:00.000Z",
  },
  threatened: true,
};

/** The figure of the shared card picture and its 4:3 box, the first child of the figure. */
const figureOf = (container: HTMLElement) =>
  container.querySelector("figure[data-card-picture]") as HTMLElement;
const boxOf = (container: HTMLElement) => figureOf(container).firstElementChild as HTMLElement;

describe("US-QS-32 · SG-PHOTO-01 the collector card shows its picture in a 4:3 box (F-0133)", () => {
  it("US-QS-32 · SG-PHOTO-01 a card with a picture shows it in the shared 4:3 box, not as a 128 px strip", () => {
    const { container } = show(card());
    const img = screen.getByRole("img", { name: "Bild von Ficus benjamina" });
    expect(img.getAttribute("src")).toBe("https://upload.example/ficus.jpg");
    expect(boxOf(container).className).toContain("aspect-[4/3]");
    expect(boxOf(container).contains(img)).toBe(true);
    expect(container.innerHTML).not.toContain("h-32");
  });

  it("US-QS-32 · SG-PHOTO-02 a card without a picture keeps the same 4:3 box with the drawn placeholder, no emoji", () => {
    const { container } = show(card({ imageUrl: null, sourceUrl: null }));
    expect(container.querySelector("img")).toBeNull();
    expect(boxOf(container).className).toContain("aspect-[4/3]");
    expect(boxOf(container).querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("🌱");
  });

  it("US-QS-32 · SG-PHOTO-01 the card has one column that can shrink below its widest content, so the picture stays inside the card at large text", () => {
    show(card());
    expect(screen.getByRole("article").className).toContain("grid-cols-1");
  });

  it("US-QS-32 · SG-PHOTO-01 the picture box leads the card, before the number and the name", () => {
    const { container } = show(card());
    expect(screen.getByRole("article").firstElementChild?.contains(figureOf(container))).toBe(true);
  });

  it("US-QS-32 · SG-PHOTO-01 the picture box is the full width of the card, with no cap from the height of the window", () => {
    const { container } = show(card());
    expect(boxOf(container).className).toContain("w-full");
    expect(boxOf(container).className).not.toContain("dvh");
    expect(boxOf(container).className).not.toContain("mx-auto");
  });

  it("US-QS-32 · Q-91 an uncaught card keeps its picture in grey, a caught one shows it in colour", () => {
    const { container, rerender } = show(card());
    expect(figureOf(container).parentElement?.className).toContain("[&_img]:grayscale");
    rerender(
      <CollectorCard
        card={card({ state: "caught", caughtDate: { date: "2026-03-05", source: "caught_at" } })}
      />,
    );
    expect(figureOf(container).parentElement?.className ?? "").not.toContain("grayscale");
  });

  it("US-QS-32 · SG-TYPE-04 the catch badge may wrap inside the card at large text (no nowrap, never wider than the card)", () => {
    show(card());
    const badge = screen.getByText(/noch nicht gefangen/);
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });
});

describe("US-QS-32 · SG-PHOTO-03 the picture credit sits directly under the picture (F-0135)", () => {
  it("US-QS-32 · SG-PHOTO-03 the credit is the caption right after the box, before the number, and its link leads to the Wikipedia page", () => {
    const { container } = show(card());
    const caption = figureOf(container).querySelector("figcaption") as HTMLElement;
    expect(caption.textContent).toBe("Bild: Wikipedia (CC BY-SA)");
    expect(caption.previousElementSibling).toBe(boxOf(container));
    expect(caption.querySelector("a")?.getAttribute("href")).toBe(
      "https://de.wikipedia.org/wiki/Ficus_benjamina",
    );
    expect(
      caption.compareDocumentPosition(screen.getByText(/^#007/)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("US-QS-32 · SG-TOUCH-01 the credit link is a 44 px target", () => {
    const { container } = show(card());
    const link = figureOf(container).querySelector("figcaption a") as HTMLElement;
    expect(link.className).toContain("min-h-11");
  });

  it("US-QS-32 · SG-PHOTO-03 a picture without a known page names source and license under it, without a link", () => {
    const { container } = show(card({ sourceUrl: null }));
    expect(figureOf(container).querySelector("figcaption")?.textContent).toBe(
      "Bild: Wikipedia (CC BY-SA), Link unbekannt",
    );
    expect(figureOf(container).querySelector("a")).toBeNull();
  });

  it("US-QS-32 · SG-PHOTO-03 a card without a picture has no picture credit, because there is no outside picture to credit", () => {
    const { container } = show(card({ imageUrl: null }));
    expect(figureOf(container).querySelector("figcaption")).toBeNull();
  });
});

describe("US-QS-32 · SG-TOUCH-01 the sources are a section of the sheet, each source once (F-0135)", () => {
  const withGbif = () => card({ natureRarity: GBIF });
  const sourcesOf = (sheet: ReturnType<typeof within>) =>
    sheet.getByRole("group", { name: "Quellen" });

  it("US-QS-15 · US-QS-32 there is exactly one sources section, and it is the last section of the sheet", async () => {
    const { sheet } = await showMore(withGbif());
    expect(sheet.getAllByRole("group", { name: "Quellen" })).toHaveLength(1);
    expect(sheet.getAllByRole("heading", { level: 3 }).at(-1)?.textContent).toBe("Quellen");
  });

  it("US-QS-32 each source appears once in the section, GBIF with its page and Wikipedia with the article", async () => {
    const { sheet } = await showMore(withGbif());
    const links = within(sourcesOf(sheet)).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["GBIF", "Wikipedia (CC BY-SA)"]);
    // Both GBIF values name one link; without a species key in the card the address stays the one the card carries.
    expect(links[0]?.getAttribute("href")).toBe(GBIF_URL);
    expect(links[1]?.getAttribute("href")).toBe("https://de.wikipedia.org/wiki/Ficus_benjamina");
    expect(links.every((l) => l.getAttribute("target") === "_blank")).toBe(true);
    expect(links.every((l) => l.getAttribute("rel") === "noopener noreferrer")).toBe(true);
  });

  it("US-QS-32 the facts carry no link: the only links of the card are the picture credit and the sources section", async () => {
    const { sheet } = await showMore(withGbif());
    expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(3);
    expect(within(sourcesOf(sheet)).getAllByRole("link")).toHaveLength(2);
  });

  it("US-QS-32 the retrieval date of the GBIF numbers stays visible in the section", async () => {
    const { sheet } = await showMore(withGbif());
    expect(sourcesOf(sheet).textContent).toContain("abgerufen 16.10.2026");
  });

  it("US-QS-32 two GBIF values from different days show the older day, never a fresher one than a number has", async () => {
    const { sheet } = await showMore(
      card({
        natureRarity: {
          ...GBIF,
          occurrences: {
            count: 1231,
            url: "https://api.gbif.org/v1/occurrence/count?taxonKey=42",
            retrievedAt: "2026-10-20T10:00:00.000Z",
          },
        },
      }),
    );
    expect(sourcesOf(sheet).textContent).toContain("abgerufen 16.10.2026");
    expect(sourcesOf(sheet).textContent).not.toContain("20.10.2026");
  });

  it("US-QS-32 · SG-TOUCH-01 the row of links is at least 44 px high and each link target is at least 44 px", async () => {
    const { sheet } = await showMore(withGbif());
    expect((sourcesOf(sheet).lastElementChild as HTMLElement).className).toContain("min-h-11");
    for (const link of within(sourcesOf(sheet)).getAllByRole("link")) {
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("min-w-11");
    }
  });

  it("US-QS-32 · SG-ICON-01 the section is secondary text, its links carry the lucide external-link icon, hidden from assistive technology", async () => {
    const { sheet } = await showMore(withGbif());
    expect(sourcesOf(sheet).className).toContain("text-muted-foreground");
    for (const link of within(sourcesOf(sheet)).getAllByRole("link")) {
      const icon = link.querySelector("svg.lucide-external-link");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("US-QS-32 the sources are separated by space, not by a dot that would hang at the end of a line or stand alone once the row wraps", async () => {
    const { sheet } = await showMore(withGbif());
    expect(sourcesOf(sheet).textContent).not.toContain("·");
  });

  it("US-QS-32 the icon follows the last word of its link inside one text run, so it wraps with the text at large text size", async () => {
    const { sheet } = await showMore(withGbif());
    for (const link of within(sourcesOf(sheet)).getAllByRole("link")) {
      const run = link.firstElementChild as HTMLElement;
      expect(run.tagName).toBe("SPAN");
      const icon = run.querySelector("svg.lucide-external-link") as SVGElement;
      expect(icon).not.toBeNull();
      expect(link.children).toHaveLength(1);
      // The last word and the icon are one nowrap run: the icon never stands alone on a line.
      expect(icon.parentElement?.className).toContain("whitespace-nowrap");
      expect(link.textContent?.endsWith(icon.parentElement?.textContent ?? "?")).toBe(true);
    }
  });

  it("US-QS-32 the section is named 'Quellen' and a species with only a Wikipedia text shows that source alone", async () => {
    const { sheet } = await showMore();
    expect(
      within(sourcesOf(sheet))
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["Wikipedia (CC BY-SA)"]);
  });

  it("US-QS-32 a species with GBIF values but no Wikipedia text has a section with GBIF only", async () => {
    const { sheet } = await showMore(
      card({ summary: null, imageUrl: null, sourceUrl: null, natureRarity: GBIF }),
    );
    expect(sourcesOf(sheet).textContent).toContain("GBIF");
    expect(sourcesOf(sheet).textContent).not.toContain("Wikipedia");
  });

  it("US-QS-32 · P-10 a Wikipedia text with an address that is not https is named without a link", async () => {
    const { sheet } = await showMore(card({ imageUrl: null, sourceUrl: "javascript:alert(1)" }));
    expect(within(sourcesOf(sheet)).queryByRole("link")).toBeNull();
    expect(sourcesOf(sheet).textContent).toContain("Wikipedia (CC BY-SA)");
    expect(sourcesOf(sheet).textContent).toContain("Link unbekannt");
  });

  it("US-QS-32 a card with neither GBIF values nor Wikipedia text has no sources section", async () => {
    const { sheet } = await showMore(card({ summary: null, imageUrl: null, sourceUrl: null }));
    expect(sheet.queryByRole("group", { name: "Quellen" })).toBeNull();
  });
});

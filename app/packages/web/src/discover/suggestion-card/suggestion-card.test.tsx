// @vitest-environment jsdom
import type { Suggestion } from "@pflanzendex/core";
import { createRef } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { SuggestionCard } from "./suggestion-card";

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

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
const show = (s: Suggestion) => render(<SuggestionCard suggestion={s} />);

/** Opens the sheet of "Mehr" of the one card on the page and returns it (US-QS-15, d-066). */
async function openMore(name = "Aglaonema commutatum") {
  await userEvent.click(screen.getByRole("button", { name: `Mehr: ${name}` }));
  return screen.findByRole("dialog", { name });
}

describe("US-QS-21 the German name scales with the text size (issue 1019)", () => {
  it("US-QS-21 the German name is set in a rem size, not inherited, so 200 % text scales it with the title", () => {
    show(suggestion({ germanName: "Zebra-Haworthie" }));
    expect(screen.getByText("Zebra-Haworthie").className).toContain("text-base");
  });
});

describe("US-QS-32 · d-159 the front of the card shows at most two facts: the light zone, then the difficulty", () => {
  it("US-QS-32 · d-159 the facts are 'Lichtzone N' and the stars with the word, and no more than two", () => {
    show(suggestion({ lightZone: 3, difficulty: 2 }));
    const facts = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(facts.length).toBeLessThanOrEqual(2);
    expect(facts.map((f) => f.textContent)).toEqual([
      "Lichtzone 3",
      "★★☆Schwierigkeit 2 von 3Mittel",
    ]);
  });

  it("US-QS-32 · P-08 an unknown light zone and difficulty say 'unbekannt'", () => {
    show(suggestion({ lightZone: null, difficulty: null }));
    expect(screen.getByText("Lichtzone unbekannt")).toBeTruthy();
    expect(screen.getByText("Schwierigkeit unbekannt")).toBeTruthy();
  });

  it("US-QS-32 · d-159 the summary, the attributes, the sources and the reasons are not on the front", () => {
    show(suggestion());
    expect(screen.queryByText(/is a species of flowering plant/)).toBeNull();
    expect(screen.queryByText("Diese Art hast du noch nicht gefangen.")).toBeNull();
    expect(screen.queryByText("Luftfeuchte")).toBeNull();
  });
});

describe("US-QS-14 difficulty stars have a text alternative", () => {
  it("US-QS-14 hides the stars and reads the level as text, without an aria-label", () => {
    show(suggestion({ difficulty: 2 }));
    expect(screen.getByText("★★☆").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Schwierigkeit 2 von 3").className).toContain("sr-only");
    expect(document.querySelector("li [aria-label]")).toBeNull();
  });
});

describe("US-QS-14 language of the card texts (WCAG 3.1.2)", () => {
  it("US-QS-14 marks an English summary with lang=en and a visible hint", async () => {
    show(suggestion());
    const sheet = await openMore();
    expect(
      within(sheet)
        .getByText(/is a species of flowering plant/)
        .getAttribute("lang"),
    ).toBe("en");
    expect(within(sheet).getByText("Text auf Englisch")).toBeTruthy();
  });

  it("US-QS-14 marks a German summary with lang=de and no hint", async () => {
    show(suggestion({ summary: "Ein Text.", summaryLanguage: "de" }));
    const sheet = await openMore();
    expect(within(sheet).getByText("Ein Text.").getAttribute("lang")).toBe("de");
    expect(within(sheet).queryByText("Text auf Englisch")).toBeNull();
  });

  it("US-QS-14 claims no language when the data does not know it (P-08)", async () => {
    show(suggestion({ summaryLanguage: null }));
    const sheet = await openMore();
    expect(
      within(sheet)
        .getByText(/is a species of flowering plant/)
        .hasAttribute("lang"),
    ).toBe(false);
    expect(within(sheet).queryByText("Text auf Englisch")).toBeNull();
  });
});

describe("US-QS-14 source link target", () => {
  it("US-QS-14 gives the picture credit a tap target of at least 44 px (min-h-11)", () => {
    show(suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" }));
    const link = screen.getByRole("link", { name: /Wikipedia \(CC BY-SA\)/ });
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("items-center");
  });
});

describe("US-QS-06 sources and licenses on the suggestion card (FR-POK-07)", () => {
  it("US-QS-06 · d-159 the credit under the picture reads 'Bild: Wikipedia (CC BY-SA)' and links the source", () => {
    show(suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" }));
    const link = screen.getByRole("link", { name: "Bild: Wikipedia (CC BY-SA)" });
    expect(link.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Aglaonema_commutatum");
  });

  it("US-QS-06 the credit of the text is in the sheet, beside the description: 'Text: Wikipedia (CC BY-SA)'", async () => {
    show(suggestion());
    expect(screen.queryByText(/^Text: Wikipedia/)).toBeNull();
    const sheet = await openMore();
    const link = within(sheet).getByRole("link", { name: "Text: Wikipedia (CC BY-SA)" });
    expect(link.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Aglaonema_commutatum");
  });

  it("US-QS-06 a picture without a known source link still names source and license, without a link", () => {
    show(suggestion({ sourceUrl: null, imageUrl: "https://upload.wikimedia.org/a.jpg" }));
    expect(screen.getByText("Bild: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("US-QS-06 nothing from Wikipedia on the card: no attribution, not on the front and not in the sheet", async () => {
    show(suggestion({ summary: null, imageUrl: null, sourceUrl: null }));
    expect(screen.queryByText(/Wikipedia/)).toBeNull();
    const sheet = await openMore();
    expect(within(sheet).queryByText(/Wikipedia/)).toBeNull();
    expect(within(sheet).getByText("Keine Beschreibung vorhanden.")).toBeTruthy();
  });
});

describe("US-ENT-06 exploration cards are marked", () => {
  it("US-ENT-06 marks an exploration card as something different on the front, and a normal card not; the reason is in the sheet", async () => {
    show(
      suggestion({
        exploration: true,
        reasons: ["Aus der Ordnung Cycadales hast du noch keine Art im Pokédex."],
      }),
    );
    expect(screen.getByText("Mal etwas anderes")).toBeTruthy();
    expect(screen.queryByText(/Aus der Ordnung Cycadales/)).toBeNull();
    const sheet = await openMore();
    expect(within(sheet).getByText(/Aus der Ordnung Cycadales/)).toBeTruthy();
    cleanup();
    show(suggestion());
    expect(screen.queryByText("Mal etwas anderes")).toBeNull();
  });

  it("US-QS-32 · SG-TYPE-04 the badge may wrap inside the card at large text (no nowrap, never wider than the card)", () => {
    show(suggestion({ exploration: true }));
    const badge = screen.getByText("Mal etwas anderes");
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });
});

describe("US-ENT-09 attributes show their source", () => {
  it("US-ENT-09 shows a known value with source link, license, date and review status, in the sheet", async () => {
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
    const sheet = await openMore();
    expect(within(sheet).getByText("Wuchsgröße").nextElementSibling?.textContent).toBe("klein");
    const list = within(sheet).getByRole("list", { name: "Quellen der Merkmale" });
    expect(list.textContent).toContain("CC0-1.0, abgerufen am 18.10.2026), ungeprüft");
    expect(within(sheet).getByRole("link", { name: "Wikidata" }).getAttribute("href")).toBe(
      "https://www.wikidata.org/wiki/Q42",
    );
    expect(within(sheet).getByRole("heading", { name: "Quellen", level: 3 })).toBeTruthy();
  });

  it("US-ENT-09 shows the light statement as 'Licht laut Quelle' with source and 'ungeprüft'", async () => {
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
    const sheet = await openMore();
    expect(
      within(sheet).getByText("Licht laut Quelle", { selector: "dt" }).nextElementSibling
        ?.textContent,
    ).toBe("helles indirektes Licht");
    const list = within(sheet).getByRole("list", { name: "Quellen der Merkmale" });
    expect(list.textContent).toContain("Licht laut Quelle: Wikipedia");
    expect(list.textContent).toContain("ungeprüft");
    // The Lichtzone comes from the species, never from the statement (P-08).
    expect(screen.getByText("Lichtzone 3")).toBeTruthy();
  });

  it("US-ENT-09 lists no source and keeps every attribute unknown without a stored fact (P-08)", async () => {
    show(suggestion());
    const sheet = await openMore();
    expect(within(sheet).queryByRole("list", { name: "Quellen der Merkmale" })).toBeNull();
    expect(within(sheet).queryByRole("heading", { name: "Quellen" })).toBeNull();
    expect(within(sheet).getAllByText("unbekannt")).toHaveLength(5);
  });
});

describe("US-QS-15 · US-QS-32 · d-066 the card opens its details in a sheet behind Mehr", () => {
  it("US-QS-15 · US-QS-32 'Mehr' is named 'Mehr: {name}' and opens a sheet titled with the card name", async () => {
    show(suggestion());
    const button = screen.getByRole("button", { name: "Mehr: Aglaonema commutatum" });
    expect(button.textContent).toBe("Mehr");
    const sheet = await openMore();
    expect(sheet).toBeTruthy();
  });

  it("US-QS-15 the sheet holds Beschreibung, Merkmale and Gründe, and Quellen only when a source exists", async () => {
    show(suggestion());
    const sheet = await openMore();
    const names = within(sheet)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(["Beschreibung", "Merkmale", "Gründe"]);
    expect(within(sheet).getByText("Diese Art hast du noch nicht gefangen.")).toBeTruthy();
  });

  it("US-QS-15 · US-QS-08 closing the sheet returns the focus to 'Mehr'", async () => {
    show(suggestion());
    const button = screen.getByRole("button", { name: "Mehr: Aglaonema commutatum" });
    const sheet = await openMore();
    await userEvent.click(within(sheet).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-15 · US-QS-32 the old toggle 'Mehr erfahren' and its clamp of three lines are gone from the card", () => {
    show(suggestion());
    expect(screen.queryByRole("button", { name: "Mehr erfahren" })).toBeNull();
    expect(document.querySelector("[data-clamped], .line-clamp-3")).toBeNull();
  });
});

describe("US-QS-15 · DS-40 the card underneath is a preview: it keeps the room of Mehr but opens nothing", () => {
  it("US-QS-15 a preview shows the word Mehr without a dialog trigger, and the front card keeps its trigger", () => {
    const { container } = render(
      <>
        <SuggestionCard suggestion={suggestion({ species: "Aloe vera" })} />
        <SuggestionCard suggestion={suggestion({ species: "Ficus lyrata" })} preview />
      </>,
    );
    const [front, under] = screen.getAllByRole("article", { hidden: true });
    expect(front?.querySelector('[aria-haspopup="dialog"]')).not.toBeNull();
    expect(under?.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    expect(under?.textContent).toContain("Mehr");
    expect(container.querySelectorAll('[aria-haspopup="dialog"]')).toHaveLength(1);
  });
});

describe("NFR-12 the suggestion picture loads when it is near the viewport", () => {
  it("NFR-12 the picture of a suggestion is loaded lazily (loading=lazy)", () => {
    show(suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" }));
    const img = screen.getByRole("img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("src")).toBe("https://upload.wikimedia.org/a.jpg");
  });
});

describe("US-ENT-01 every card has element ids of its own (axe duplicate-id)", () => {
  it("US-ENT-01 two cards on one page each name themselves by their own heading, and no id occurs twice", () => {
    render(
      <>
        <SuggestionCard suggestion={suggestion({ species: "Aloe vera" })} />
        <SuggestionCard suggestion={suggestion({ species: "Ficus lyrata" })} />
      </>,
    );
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      const heading = document.getElementById(article.getAttribute("aria-labelledby") ?? "");
      expect(heading?.tagName).toBe("H2");
      expect(heading?.closest("article")).toBe(article);
    }
    const ids = Array.from(document.querySelectorAll("[id]"), (e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("US-ENT-01 the name heading takes the focus through titleRef, so the focus follows the card the keeper sees", () => {
    const title = createRef<HTMLHeadingElement>();
    render(<SuggestionCard suggestion={suggestion()} titleRef={title} />);
    title.current?.focus();
    expect(document.activeElement).toBe(title.current);
  });
});

describe("US-QS-32 · SG-PHOTO-02 the card shows the drawn placeholder, not an emoji, without a picture", () => {
  it("US-QS-32 · SG-PHOTO-02 a suggestion without a picture shows the drawn sprout of the family, and no emoji", () => {
    const { container } = render(<SuggestionCard suggestion={suggestion()} />);
    expect(container.textContent).not.toContain("🌱");
    expect(container.querySelector("figure[data-card-picture] svg")).not.toBeNull();
  });
});

describe("US-QS-32 · SG-PHOTO-03 the Wikipedia credit sits directly under the picture", () => {
  it("US-QS-32 · SG-PHOTO-03 the credit is the caption of the picture, before the name, not the last line of the card", () => {
    const { container } = render(
      <SuggestionCard
        suggestion={suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" })}
      />,
    );
    const figure = container.querySelector("figure[data-card-picture]") as HTMLElement;
    const caption = figure.querySelector("figcaption");
    expect(caption?.textContent).toBe("Bild: Wikipedia (CC BY-SA)");
    expect(caption?.previousElementSibling).toBe(figure.firstElementChild);
    const name = screen.getByRole("heading", { name: "Aglaonema commutatum" });
    expect(caption?.compareDocumentPosition(name) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("US-QS-32 · SG-PHOTO-03 no caption under the drawn placeholder: no picture, nothing to credit", () => {
    const { container } = render(<SuggestionCard suggestion={suggestion()} />);
    expect(container.querySelector("figcaption")).toBeNull();
  });
});

describe("US-QS-32 · SG-SHAPE-01 the card has the card radius of 22 px", () => {
  it("US-QS-32 · SG-SHAPE-01 the suggestion card takes rounded-card, not the tile radius", () => {
    show(suggestion());
    const card = screen.getByRole("article");
    expect(card.className).toContain("rounded-card");
    expect(card.className).not.toContain("rounded-xl");
  });
});

describe("US-QS-32 · US-QS-15 · SG-PHOTO-01 the deck never scrolls: no scroll region in the card, no height cap on the picture", () => {
  const boxOf = (container: HTMLElement) =>
    container.querySelector("figure[data-card-picture]")?.firstElementChild as HTMLElement;

  it.each([true, false])(
    "US-QS-32 · US-QS-15 the card has no scroll region of its own at the normal and the large text size (fill=%s)",
    (fill) => {
      const { container } = render(<SuggestionCard suggestion={suggestion()} fill={fill} />);
      const scrolling = container.querySelectorAll(
        '[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"], [data-scroll-region]',
      );
      expect(scrolling).toHaveLength(0);
    },
  );

  it("US-QS-32 · SG-PHOTO-01 the picture box is 4:3 with no width cap from a constant of the window height", () => {
    const { container } = render(
      <SuggestionCard
        suggestion={suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" })}
      />,
    );
    const box = boxOf(container);
    expect(box.className).toContain("aspect-[4/3]");
    expect(box.className).toContain("w-full");
    expect(box.className).not.toContain("dvh");
  });

  it("US-QS-32 the exploration badge lies on the picture, so it costs the card no line (US-ENT-06)", () => {
    const { container } = render(<SuggestionCard suggestion={suggestion({ exploration: true })} />);
    expect(boxOf(container).contains(screen.getByText("Mal etwas anderes"))).toBe(true);
  });

  it("US-QS-32 · US-QS-15 in the deck the card is the size container its picture reads: the picture takes the width the free height leaves", () => {
    const { container } = render(
      <SuggestionCard
        suggestion={suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" })}
      />,
    );
    expect(screen.getByRole("article").className).toContain("[container-type:size]");
    expect(boxOf(container).className).toContain("100cqh");
  });

  it("US-QS-32 at large text the card has its own height: no size container, the picture is the full width", () => {
    const { container } = render(
      <SuggestionCard
        suggestion={suggestion({ imageUrl: "https://upload.wikimedia.org/a.jpg" })}
        fill={false}
      />,
    );
    expect(screen.getByRole("article").className).not.toContain("container-type");
    expect(boxOf(container).className).not.toContain("cqh");
  });

  it("US-QS-32 · SG-TYPE-05 a long one-word name breaks inside the card instead of widening it", () => {
    show(suggestion({ species: "Schwiegermutterzunge" }));
    expect(screen.getByRole("article").className).toContain("break-words");
  });
});

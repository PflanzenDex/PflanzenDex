// @vitest-environment jsdom
import type { MatchCard as Card } from "@pflanzendex/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MatchCard } from "./match-card";

afterEach(cleanup);

/** A match card as the API answers it; the picture fields are the catalog's (US-QS-32). */
const card = (extra: Record<string, unknown> = {}) =>
  ({
    ownerName: "Ben",
    offerId: "o1",
    specimenId: "s1",
    type: "cutting",
    mode: "swap",
    wish: null,
    note: null,
    offeredAt: "2026-10-08T10:00:00.000Z",
    photosShared: false,
    specimenName: "Ableger",
    speciesLatin: "Aloe vera",
    speciesGerman: "Echte Aloe",
    health: { treatmentOpen: false, lastTreated: null },
    phase: null,
    lack: true,
    onWishlist: true,
    requested: false,
    reasons: [{ kind: "wishlist", species: "Aloe vera", reasoning: null }],
    imageUrl: "https://upload.wikimedia.org/aloe.jpg",
    imageSourceUrl: "https://de.wikipedia.org/wiki/Aloe_vera",
    ...extra,
  }) as unknown as Card;

/** The picture box of the card, the first child of its figure. */
const boxOf = (container: HTMLElement) =>
  container.querySelector("figure[data-card-picture]")?.firstElementChild as HTMLElement;

describe("US-QS-32 · SG-PHOTO-01 the match card shows its catalog picture in a 4:3 box", () => {
  it("US-QS-32 · SG-PHOTO-01 a card with a catalog picture shows that picture, with the species as its alternative text", () => {
    const { container } = render(<MatchCard card={card()} />);
    const img = screen.getByRole("img", { name: "Bild von Echte Aloe" });
    expect(img.getAttribute("src")).toBe("https://upload.wikimedia.org/aloe.jpg");
    expect(boxOf(container).className).toContain("aspect-[4/3]");
    expect(boxOf(container).contains(img)).toBe(true);
  });

  it("US-QS-32 · SG-PHOTO-02 a card without a catalog picture shows the drawn placeholder, not an emoji, in the same box", () => {
    const { container } = render(
      <MatchCard card={card({ imageUrl: null, imageSourceUrl: null })} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(boxOf(container).querySelector("svg")).not.toBeNull();
    expect(boxOf(container).className).toContain("aspect-[4/3]");
    expect(container.textContent).not.toContain("🌱");
  });

  it("US-QS-32 · SG-PHOTO-01 at the normal text size the box takes its width from the height cap, so it stays 4:3 and centred", () => {
    const { container } = render(<MatchCard card={card()} />);
    const box = boxOf(container);
    expect(box.className).toContain("mx-auto");
    expect(box.className).toContain("100dvh_-_600px");
    expect(box.className).toContain("*4/3");
  });

  it("US-QS-32 · SG-PHOTO-01 at large text the picture is not capped by the screen height: the card takes its own height", () => {
    const { container } = render(<MatchCard card={card()} large />);
    expect(boxOf(container).className).not.toContain("dvh");
  });
});

describe("US-QS-32 · SG-PHOTO-03 the Wikipedia credit sits directly under the picture", () => {
  it("US-QS-32 · SG-PHOTO-03 the credit is the caption of the picture, before the name, and its link leads to the page of the picture", () => {
    const { container } = render(<MatchCard card={card()} />);
    const figure = container.querySelector("figure[data-card-picture]") as HTMLElement;
    const caption = figure.querySelector("figcaption");
    expect(caption?.textContent).toBe("Bild und Text: Wikipedia (CC BY-SA)");
    expect(caption?.previousElementSibling).toBe(figure.firstElementChild);
    expect(caption?.querySelector("a")?.getAttribute("href")).toBe(
      "https://de.wikipedia.org/wiki/Aloe_vera",
    );
    const name = screen.getByRole("heading", { name: "Echte Aloe" });
    expect(caption?.compareDocumentPosition(name) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("US-QS-32 · SG-PHOTO-03 a picture without a known page names its source and license, without a link", () => {
    render(<MatchCard card={card({ imageSourceUrl: null })} />);
    expect(screen.getByText("Bild und Text: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
  });

  it("US-QS-32 · SG-PHOTO-03 a card without any picture has no credit, because there is no outside picture to credit", () => {
    const { container } = render(
      <MatchCard card={card({ imageUrl: null, imageSourceUrl: null })} />,
    );
    expect(container.querySelector("figcaption")).toBeNull();
  });
});

describe("US-QS-32 · SG-SHAPE-01 the match card has the card radius of the stack under it", () => {
  it("US-QS-32 · SG-SHAPE-01 the match card takes rounded-card, not the tile radius", () => {
    render(<MatchCard card={card()} />);
    const article = screen.getByRole("article");
    expect(article.className).toContain("rounded-card");
    expect(article.className).not.toContain("rounded-xl");
  });
});

describe("US-QS-32 · SG-TYPE-04 at large text the card keeps its width: credit and wish badges wrap inside it", () => {
  it("US-QS-32 · SG-TYPE-04 the card has one column that shrinks to the card, so the credit wraps instead of widening it", () => {
    render(<MatchCard card={card()} large />);
    expect(screen.getByRole("article").className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("US-QS-32 · SG-TYPE-04 a wish badge may wrap inside the card (no nowrap), so a long species name stays in the card", () => {
    render(<MatchCard card={card()} large />);
    const badge = screen.getByText("Auf deiner Wunschliste: Aloe vera");
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });

  it("US-QS-32 · SG-TYPE-04 the 'fits both ways' badge wraps inside the card too (no nowrap at large text)", () => {
    render(
      <MatchCard
        card={card({
          reasons: [
            { kind: "wishlist", species: "Aloe vera", reasoning: null },
            {
              kind: "both_ways",
              giverName: "Ben",
              offerId: "x1",
              specimenId: "s9",
              speciesLatin: "Ficus",
              speciesGerman: "Feige",
            },
          ],
        })}
        large
      />,
    );
    const badge = screen.getByText("Passt in beide Richtungen");
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });
});

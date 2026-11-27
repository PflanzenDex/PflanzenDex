// @vitest-environment jsdom
import type { MatchCard as Card } from "@pflanzendex/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { MatchCard } from "./match-card";

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

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

const bothWays = {
  kind: "both_ways",
  giverName: "Ben",
  offerId: "x1",
  specimenId: "s9",
  speciesLatin: "Ficus lyrata",
  speciesGerman: "Geigenfeige",
};
const wishlist = { kind: "wishlist", species: "Aloe vera", reasoning: null };

/** The picture box of the card, the first child of its figure. */
const boxOf = (container: HTMLElement) =>
  container.querySelector("figure[data-card-picture]")?.firstElementChild as HTMLElement;

/** Opens the sheet of "Mehr" and returns it (US-QS-15, d-066). */
async function openMore(name = "Echte Aloe") {
  await userEvent.click(screen.getByRole("button", { name: `Mehr: ${name}` }));
  return within(await screen.findByRole("dialog", { name }));
}

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

  it("US-QS-32 · SG-PHOTO-01 at large text the card has its own height: the picture is the full width of the card, with no cap at all", () => {
    const { container } = render(<MatchCard card={card()} fill={false} />);
    const box = boxOf(container);
    expect(box.className).toContain("w-full");
    expect(box.className).not.toMatch(/cqh|dvh|mx-auto/);
  });

  it("US-QS-32 · US-QS-15 · SG-PHOTO-01 in the deck the box is the full width wherever the free height allows it: its cap is the height the deck leaves, not a constant of the window", () => {
    const { container } = render(<MatchCard card={card()} />);
    const box = boxOf(container);
    expect(box.className).toContain("100cqh");
    expect(box.className).toContain("*4/3");
    expect(box.className).not.toContain("dvh");
    // The card is the size container the cap reads, and never a scroll region (the deck never scrolls).
    expect(screen.getByRole("article").className).toContain("[container-type:size]");
  });
});

describe("US-QS-32 · SG-PHOTO-03 the Wikipedia credit sits directly under the picture", () => {
  it("US-QS-32 · SG-PHOTO-03 the credit reads 'Bild: Wikipedia (CC BY-SA)', is the caption of the picture, before the name, and links the page of the picture", () => {
    const { container } = render(<MatchCard card={card()} />);
    const figure = container.querySelector("figure[data-card-picture]") as HTMLElement;
    const caption = figure.querySelector("figcaption");
    expect(caption?.textContent).toBe("Bild: Wikipedia (CC BY-SA)");
    expect(caption?.previousElementSibling).toBe(figure.firstElementChild);
    expect(caption?.querySelector("a")?.getAttribute("href")).toBe(
      "https://de.wikipedia.org/wiki/Aloe_vera",
    );
    const name = screen.getByRole("heading", { name: "Echte Aloe" });
    expect(caption?.compareDocumentPosition(name) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("US-QS-32 · SG-PHOTO-03 a picture without a known page names its source and license, without a link", () => {
    render(<MatchCard card={card({ imageSourceUrl: null })} />);
    expect(screen.getByText("Bild: Wikipedia (CC BY-SA), Link unbekannt")).toBeTruthy();
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

describe("US-QS-32 · d-160 the front of the match card: one reason, the giver, the offer as one fact", () => {
  it("US-QS-32 · d-160 shows the byline 'Von Ben', and 'Von einem Freund' without a name", () => {
    const { rerender } = render(<MatchCard card={card()} />);
    expect(screen.getByText("Von Ben")).toBeTruthy();
    rerender(<MatchCard card={card({ ownerName: null })} />);
    expect(screen.getByText("Von einem Freund")).toBeTruthy();
  });

  it("US-QS-32 · d-160 shows the offer as the one fact 'Steckling · Tauschen' and no second fact while no treatment is open", () => {
    render(<MatchCard card={card()} />);
    const facts = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(facts.map((f) => f.textContent)).toEqual(["Steckling · Tauschen"]);
  });

  it("US-QS-32 · d-160 an open treatment is the second fact, 'Behandlung offen', without a pest name (the offer has none)", () => {
    render(<MatchCard card={card({ health: { treatmentOpen: true, lastTreated: null } })} />);
    const facts = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(facts.map((f) => f.textContent)).toEqual(["Steckling · Tauschen", "Behandlung offen"]);
    expect(facts.length).toBeLessThanOrEqual(2);
  });

  it("US-QS-32 · d-160 the health text, the wish, the note and the dormancy are not on the front", () => {
    render(
      <MatchCard
        card={card({
          wish: "Eine Ficus-Stecklinge",
          note: "Abholung samstags",
          phase: "dormancy",
          health: {
            treatmentOpen: false,
            lastTreated: { reason: "Thripse", doneAt: "2026-03-12" },
          },
        })}
      />,
    );
    expect(screen.queryByText(/Eine Ficus-Stecklinge/)).toBeNull();
    expect(screen.queryByText(/Abholung samstags/)).toBeNull();
    expect(screen.queryByText(/Zuletzt behandelt/)).toBeNull();
    expect(screen.queryByText("Zurzeit in der Ruhephase.")).toBeNull();
  });

  it("US-QS-32 · d-160 a wish reason shows one badge 'Auf deiner Wunschliste' without the species appended", () => {
    render(<MatchCard card={card()} />);
    expect(screen.getByText("Auf deiner Wunschliste")).toBeTruthy();
    expect(screen.queryByText(/Passt in beide Richtungen/)).toBeNull();
    expect(screen.queryByText(/Wunschliste: /)).toBeNull();
  });

  it("US-QS-32 · d-160 'Passt in beide Richtungen' wins over the wish: it is the one badge, the wish goes into the sheet", async () => {
    render(<MatchCard card={card({ reasons: [wishlist, bothWays] })} />);
    const front = screen.getByRole("article");
    expect(within(front).getByText("Passt in beide Richtungen")).toBeTruthy();
    expect(within(front).queryByText("Auf deiner Wunschliste")).toBeNull();
    const sheet = await openMore();
    expect(sheet.getByText("Auf deiner Wunschliste")).toBeTruthy();
    expect(sheet.getByText(/Ben möchte Geigenfeige von dir\./)).toBeTruthy();
  });

  it("US-QS-32 · d-160 a card with no reason shows no badge, and no empty box on the picture", () => {
    const { container } = render(<MatchCard card={card({ reasons: [] })} />);
    expect(screen.queryByText("Auf deiner Wunschliste")).toBeNull();
    expect(screen.queryByText("Passt in beide Richtungen")).toBeNull();
    expect(boxOf(container).children).toHaveLength(1);
  });

  it("US-QS-32 · SG-TYPE-04 a reason badge may wrap inside the card at large text (no nowrap, never wider than the card)", () => {
    render(<MatchCard card={card({ reasons: [wishlist, bothWays] })} />);
    const badge = screen.getByText("Passt in beide Richtungen");
    expect(badge.className).toContain("whitespace-normal");
    expect(badge.className).toContain("max-w-full");
  });
});

describe("US-QS-15 · US-QS-32 · d-066 the sheet of Mehr holds what is not on the front", () => {
  it("US-QS-15 · US-QS-32 'Mehr' is named 'Mehr: {title}' and opens a sheet titled with the card name", async () => {
    render(<MatchCard card={card()} />);
    expect(screen.getByRole("button", { name: "Mehr: Echte Aloe" }).textContent).toBe("Mehr");
    await openMore();
  });

  it("US-QS-15 the sheet holds Gesundheit, Hinweis von {name}, Wunsch von {name} and Gründe", async () => {
    render(
      <MatchCard
        card={card({
          wish: "Eine Ficus-Stecklinge",
          note: "Abholung samstags",
          phase: "dormancy",
          health: {
            treatmentOpen: false,
            lastTreated: { reason: "Thripse", doneAt: "2026-03-12" },
          },
          reasons: [{ ...wishlist, reasoning: "Steht schon lange auf meiner Liste" }],
        })}
      />,
    );
    const sheet = await openMore();
    const names = sheet.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Gesundheit", "Hinweis von Ben", "Wunsch von Ben", "Gründe"]);
    expect(sheet.getByText("Zuletzt behandelt: Thripse, 12.03.2026")).toBeTruthy();
    expect(sheet.getByText("Zurzeit in der Ruhephase.")).toBeTruthy();
    expect(sheet.getByText("Abholung samstags")).toBeTruthy();
    expect(sheet.getByText("Eine Ficus-Stecklinge")).toBeTruthy();
    expect(sheet.getByText("Dein Grund: Steht schon lange auf meiner Liste")).toBeTruthy();
  });

  it("US-QS-15 · P-08 without a name the sections say 'einem Freund'; without a wish and a note they are not there", async () => {
    render(<MatchCard card={card({ ownerName: null, wish: "Aloe", note: null })} />);
    const sheet = await openMore();
    const names = sheet.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Gesundheit", "Wunsch von einem Freund", "Gründe"]);
    expect(sheet.getByText("Keine Behandlung bekannt")).toBeTruthy();
  });

  it("US-QS-15 · US-QS-08 closing the sheet returns the focus to 'Mehr'", async () => {
    render(<MatchCard card={card()} />);
    const button = screen.getByRole("button", { name: "Mehr: Echte Aloe" });
    const sheet = await openMore();
    await userEvent.click(sheet.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("US-QS-32 · SG-TYPE-04 · US-QS-15 the card keeps its width and never scrolls", () => {
  it("US-QS-32 · SG-TYPE-04 the card has one column that shrinks to the card, so the credit wraps instead of widening it", () => {
    render(<MatchCard card={card()} />);
    expect(screen.getByRole("article").className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("US-QS-15 · US-QS-32 the front has no scroll region of its own", () => {
    const { container } = render(<MatchCard card={card()} />);
    expect(
      container.querySelectorAll(
        '[class*="overflow-y-auto"], [class*="overflow-auto"], [data-scroll-region]',
      ),
    ).toHaveLength(0);
  });
});

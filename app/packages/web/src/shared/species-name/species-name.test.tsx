// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { SpeciesName, SpeciesNameInline } from "./species-name";

afterEach(cleanup);

/** The element that holds the text, and whether it or an ancestor is italic (SG-TYPE-06). */
const isItalic = (el: HTMLElement) => el.tagName === "I" || el.closest("i") !== null;

describe("US-QS-32 SpeciesName: the German name leads, the scientific name is italic (SG-TYPE-08)", () => {
  it("US-QS-32 with a German name the German name is the title, upright and not italic", () => {
    render(<SpeciesName scientific="Aglaonema commutatum" german="Kolbenfaden" />);
    const title = screen.getByText("Kolbenfaden");
    expect(title.tagName).toBe("SPAN");
    expect(title.className).toContain("font-semibold");
    expect(isItalic(title)).toBe(false);
  });

  it("US-QS-32 with a German name the scientific name is italic on the meta line, before any further meta", () => {
    const { container } = render(
      <SpeciesName
        scientific="Aglaonema commutatum"
        german="Kolbenfaden"
        meta="gefangen 07.09.2026"
      />,
    );
    const latin = screen.getByText("Aglaonema commutatum");
    expect(latin.tagName).toBe("I");
    // The meta line is split in parts that stay whole (US-QS-15): the name is the first one.
    const meta = latin.closest("[data-meta-part]")?.parentElement as HTMLElement;
    expect(meta.className).toContain("text-sm");
    expect(plain(meta.textContent)).toBe("Aglaonema commutatum · gefangen 07.09.2026");
    expect(plain(container.textContent)).toBe(
      "Kolbenfaden Aglaonema commutatum · gefangen 07.09.2026",
    );
  });

  it("US-QS-32 with a German name and no further meta the meta line is the scientific name alone", () => {
    render(<SpeciesName scientific="Ficus lyrata" german="Geigenfeige" />);
    const latin = screen.getByText("Ficus lyrata");
    expect((latin.parentElement as HTMLElement).textContent).toBe("Ficus lyrata");
  });

  it("US-QS-32 without a German name the scientific name is the one italic title, once", () => {
    const { container } = render(
      <SpeciesName scientific="Aloe vera" german={null} meta="gefangen 01.01.2026" />,
    );
    expect(screen.getAllByText("Aloe vera")).toHaveLength(1);
    const title = screen.getByText("Aloe vera");
    expect(title.tagName).toBe("I");
    expect(title.parentElement?.className).toContain("font-semibold");
    // The meta line holds only the meta: the name is not repeated there.
    expect(container.textContent).toBe("Aloe vera gefangen 01.01.2026");
  });

  it("US-QS-32 a German name equal to the scientific name is no German name: the name stands once, italic", () => {
    const { container } = render(
      <SpeciesName scientific="Monstera adansonii" german="Monstera adansonii" />,
    );
    expect(container.textContent).toBe("Monstera adansonii");
    expect(isItalic(screen.getByText("Monstera adansonii"))).toBe(true);
  });

  it("US-QS-32 an empty German name is no German name (P-08, nothing invented)", () => {
    const { container } = render(<SpeciesName scientific="Aloe vera" german="" />);
    expect(container.textContent).toBe("Aloe vera");
    expect(isItalic(screen.getByText("Aloe vera"))).toBe(true);
  });

  it("US-QS-32 the title can be a heading of the card and keeps its own classes", () => {
    render(
      <SpeciesName
        scientific="Ficus lyrata"
        german="Geigenfeige"
        as="h2"
        titleClassName="text-lg"
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Geigenfeige" });
    expect(heading.className).toContain("text-lg");
    expect(heading.className).toContain("font-semibold");
  });

  it("US-QS-32 a lead stays upright before the name, e.g. the place in a list", () => {
    render(<SpeciesName lead="1. " scientific="Ficus lyrata" german="Geigenfeige" />);
    const title = screen.getByText("1. Geigenfeige");
    expect(title.querySelector("i")).toBeNull();
    expect(title.className).toContain("font-semibold");
  });

  it("US-QS-32 · US-POK-01 the tooltip of the title names the full German name", () => {
    render(<SpeciesName scientific="Betula pendula" german="Birke" tooltip="Birke (Sandbirke)" />);
    expect(screen.getByText("Birke").getAttribute("title")).toBe("Birke (Sandbirke)");
  });
});

describe("US-QS-32 SpeciesName: the German name hyphenates at syllables, the scientific name never (issue 2366)", () => {
  const classesOf = (el: HTMLElement) => el.className.split(" ");

  it("US-QS-32 the German-name title carries hyphens-auto, so 'Schmetterlingsorchidee' breaks at a syllable", () => {
    render(<SpeciesName scientific="Phalaenopsis amabilis" german="Schmetterlingsorchidee" />);
    expect(classesOf(screen.getByText("Schmetterlingsorchidee"))).toContain("hyphens-auto");
  });

  it("US-QS-32 the German-name title of a heading carries hyphens-auto too", () => {
    render(
      <SpeciesName
        scientific="Phalaenopsis amabilis"
        german="Schmetterlingsorchidee"
        as="h2"
        titleClassName="text-lg"
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Schmetterlingsorchidee" });
    expect(classesOf(heading)).toContain("hyphens-auto");
    expect(classesOf(heading)).toContain("text-lg");
  });

  it("US-QS-32 the scientific name on the meta line is hyphens-manual, so it breaks only at a soft hyphen", () => {
    render(
      <SpeciesName
        scientific="Phalaenopsis amabilis"
        german="Schmetterlingsorchidee"
        meta="gefangen 07.09.2026"
      />,
    );
    const latin = screen.getByText("Phalaenopsis amabilis");
    expect(latin.tagName).toBe("I");
    expect(classesOf(latin)).toContain("hyphens-manual");
  });

  it("US-QS-32 the scientific name as the title (no German name) is hyphens-manual inside the hyphenating title", () => {
    render(<SpeciesName scientific="Phalaenopsis amabilis" german={null} />);
    const latin = screen.getByText("Phalaenopsis amabilis");
    expect(latin.tagName).toBe("I");
    expect(classesOf(latin)).toContain("hyphens-manual");
    expect(classesOf(latin.parentElement as HTMLElement)).toContain("hyphens-auto");
  });

  it("US-QS-32 the scientific name in running text is hyphens-manual", () => {
    render(
      <p>
        <SpeciesNameInline scientific="Phalaenopsis amabilis" german="Schmetterlingsorchidee" />
      </p>,
    );
    expect(classesOf(screen.getByText("Phalaenopsis amabilis"))).toContain("hyphens-manual");
  });
});

describe("US-QS-32 SpeciesNameInline: a name in running text (milestones)", () => {
  it("US-QS-32 a German name is followed by the scientific name in brackets, the scientific one italic", () => {
    const { container } = render(
      <p>
        <SpeciesNameInline scientific="Aphelandra squarrosa" german="Glanzkölbchen" />
      </p>,
    );
    expect(container.textContent).toBe("Glanzkölbchen (Aphelandra squarrosa)");
    const latin = screen.getByText("Aphelandra squarrosa");
    expect(latin.tagName).toBe("I");
    expect(isItalic(screen.getByText(/Glanzkölbchen/))).toBe(false);
  });

  it("US-QS-32 without a German name the scientific name alone, italic and once", () => {
    const { container } = render(
      <p>
        <SpeciesNameInline scientific="Aphelandra squarrosa" german={null} />
      </p>,
    );
    expect(container.textContent).toBe("Aphelandra squarrosa");
    expect(screen.getByText("Aphelandra squarrosa").tagName).toBe("I");
  });

  it("US-QS-32 a German name equal to the scientific one is shown once, italic", () => {
    const { container } = render(
      <p>
        <SpeciesNameInline scientific="Monstera adansonii" german="Monstera adansonii" />
      </p>,
    );
    expect(container.textContent).toBe("Monstera adansonii");
  });
});

describe("US-QS-32 the meta line is regular weight, whatever row it sits in (F-0119)", () => {
  it("US-QS-32 with a German name the meta line is font-normal, not the semibold of the row button", () => {
    render(
      <SpeciesName scientific="Ficus lyrata" german="Geigenfeige" meta="gefangen 05.03.2026" />,
    );
    const meta = screen.getByText("Ficus lyrata").closest("[data-meta-part]")
      ?.parentElement as HTMLElement;
    expect(meta.className).toContain("font-normal");
    expect(meta.className).not.toContain("font-semibold");
  });

  it("US-QS-32 without a German name the meta line is font-normal too", () => {
    render(<SpeciesName scientific="Aloe vera" german={null} meta="gefangen 01.01.2026" />);
    const meta = screen.getByText("gefangen 01.01.2026").closest("span") as HTMLElement;
    expect(meta.className).toContain("font-normal");
  });
});

describe("US-QS-15 SG-TYPE-05 SpeciesName: the meta line breaks only between its parts (issue 2640)", () => {
  const partsOf = (root: HTMLElement) =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-meta-part]"));

  it("US-QS-15 at 360 px the italic name and the further meta are parts, and a meta text with ' · ' is cut into its parts too", () => {
    setViewportWidth(360);
    const { container } = render(
      <SpeciesName scientific="Dracaena trifasciata" german="Bogenhanf" meta="Leicht · Zone 2" />,
    );
    const parts = partsOf(container);
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "Dracaena trifasciata ·",
      "Leicht ·",
      "Zone 2",
    ]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    // The scientific name is still one italic element, and the text is the same as before.
    expect(parts[0]?.querySelector("i")?.textContent).toBe("Dracaena trifasciata");
    expect(plain(container.textContent)).toBe("Bogenhanf Dracaena trifasciata · Leicht · Zone 2");
  });

  it("US-QS-15 without a German name the meta line is the further meta alone, cut at its ' · ' too", () => {
    const { container } = render(
      <SpeciesName scientific="Aloe vera" german={null} meta="gefangen 01.01.2026 · Zone 2" />,
    );
    expect(partsOf(container).map((p) => plain(p.textContent))).toEqual([
      "gefangen 01.01.2026 ·",
      "Zone 2",
    ]);
  });

  it("US-QS-15 a meta that is an element stays whole inside its part", () => {
    const { container } = render(
      <SpeciesName scientific="Aloe vera" german="Echte Aloe" meta={<b>fällig</b>} />,
    );
    const parts = partsOf(container);
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Aloe vera ·", "fällig"]);
    expect(parts[1]?.querySelector("b")?.textContent).toBe("fällig");
  });

  it("US-QS-15 the scientific name alone is no list of parts: no part, one plain text", () => {
    const { container } = render(<SpeciesName scientific="Ficus lyrata" german="Geigenfeige" />);
    expect(partsOf(container)).toHaveLength(0);
  });
});

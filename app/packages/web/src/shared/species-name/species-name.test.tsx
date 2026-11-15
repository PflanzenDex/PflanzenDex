// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
    const meta = latin.parentElement as HTMLElement;
    expect(meta.className).toContain("text-sm");
    expect(meta.textContent).toBe("Aglaonema commutatum · gefangen 07.09.2026");
    expect(container.textContent).toBe("Kolbenfaden Aglaonema commutatum · gefangen 07.09.2026");
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
    const meta = screen.getByText("Ficus lyrata").parentElement as HTMLElement;
    expect(meta.className).toContain("font-normal");
    expect(meta.className).not.toContain("font-semibold");
  });

  it("US-QS-32 without a German name the meta line is font-normal too", () => {
    render(<SpeciesName scientific="Aloe vera" german={null} meta="gefangen 01.01.2026" />);
    const meta = screen.getByText("gefangen 01.01.2026").closest("span") as HTMLElement;
    expect(meta.className).toContain("font-normal");
  });
});

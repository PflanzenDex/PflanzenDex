// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { CandidateCard } from "./candidate-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACCESS = { api: "http://api", token: async () => "tok" };
// A Commons address has no break opportunity: at 200 % text on a phone it is wider than the card (issue 1903).
const LONG_ADDRESS =
  "https://commons.wikimedia.org/wiki/File:Ficus_lyrata_in_Wohnzimmer_am_Fenster_Aufnahme_2024_hochaufloesend.jpg";
const candidate = (stored: boolean): Candidate => ({
  id: "w1",
  name: "Ficus lyrata",
  german: "Geigenfeige",
  title: "Geigenfeige (Ficus lyrata)",
  stock: 1,
  zoneText: "Lampe 3 – 1 Pflanze",
  zone: { id: "z1", name: "Lampe 3" },
  difficulty: 2,
  reasoning: "Mehr Platz in Lampe 4",
  priority: { kind: "thinnest", text: "Hier steht schon 1 Pflanze." },
  image: {
    url: LONG_ADDRESS,
    source: `Anna Beispiel, ${LONG_ADDRESS}`,
    license: "CC BY-SA 4.0",
    stored,
  },
});

const classesOf = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(" ");

// US-QS-15 (issue 1903, SG-TYPE-04): at 200 % text on a phone a long picture address stays inside the card, and a stored picture
// beside the text does not leave the text no room.
describe("US-QS-15 the wish card at 200 % text keeps its picture source inside (issue 1903)", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:wish");
    URL.revokeObjectURL = vi.fn();
  });

  it("US-QS-15 the source line of a picture that is not stored breaks anywhere, so a long address wraps inside the card", () => {
    render(<CandidateCard c={candidate(false)} rank={1} />);
    const caption = screen.getByText(/^Quelle: Anna Beispiel/);
    expect(caption.tagName).toBe("FIGCAPTION");
    expect(classesOf(caption)).toContain("[overflow-wrap:anywhere]");
  });

  it("US-QS-15 the source line under a stored picture breaks anywhere too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1]))),
    );
    render(<CandidateCard c={candidate(true)} rank={1} photoAccess={ACCESS} />);
    await screen.findByRole("img", { name: "Bild von Geigenfeige (Ficus lyrata)" });
    const line = screen.getByText(/^Quelle: Anna Beispiel.*Lizenz: CC BY-SA 4\.0$/);
    expect(classesOf(line)).toContain("[overflow-wrap:anywhere]");
  });

  it("US-QS-15 a stored picture and the text wrap: the text keeps a rem basis and moves below the picture when it does not fit beside it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1]))),
    );
    render(<CandidateCard c={candidate(true)} rank={1} photoAccess={ACCESS} />);
    const picture = await screen.findByRole("button", {
      name: "Bild von Geigenfeige (Ficus lyrata) groß anzeigen",
    });
    const row = picture.parentElement;
    expect(classesOf(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    const text = picture.nextElementSibling;
    expect(classesOf(text)).toEqual(expect.arrayContaining(["min-w-0", "grow", "basis-32"]));
    expect(classesOf(text)).not.toContain("flex-1");
  });
});

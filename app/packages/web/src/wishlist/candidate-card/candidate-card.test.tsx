// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { CandidateCard } from "./candidate-card";

const mockCandidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "w1",
  name: "Test Wish",
  german: null,
  title: "Geigenfeige (Ficus lyrata)",
  stock: 1,
  zoneText: "Lampe 3 — 1 Pflanze",
  zone: { id: "z1", name: "Lampe 3" },
  difficulty: 2,
  reasoning: "Mehr Platz in Lampe 4",
  priority: { kind: "thinnest", text: "Hier steht schon 1 Pflanze." },
  image: null,
  ...overrides,
});

describe("US-WUN-01 candidate card rendering", () => {
  it("renders 'Kein Bild' when image URL contains credentials", () => {
    const candidate = mockCandidate({
      image: {
        url: "https://user:password@example.com/image.jpg",
        source: "Example",
        license: null,
        stored: false,
      },
    });

    render(<CandidateCard c={candidate} rank={1} />);
    expect(screen.getByText("Kein Bild")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

const FILE = "https://commons.wikimedia.org/wiki/File:Ficus.jpg";
const image = (stored: boolean, license: string | null = "CC BY-SA 4.0") => ({
  url: FILE,
  source: "Anna Beispiel, " + FILE,
  license,
  stored,
});
const ACCESS = { api: "http://api", token: async () => "tok" };

describe("US-WUN-04 the stored image of a candidate", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:wish");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the local copy fetched with the token, with alternative text, source and license, never the foreign address", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchFn);
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    const img = await screen.findByRole("img", { name: "Bild von Geigenfeige (Ficus lyrata)" });
    expect(img.getAttribute("src")).toBe("blob:wish");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/wishes/w1/image");
    expect(screen.getByText(/Quelle: Anna Beispiel/)).toBeTruthy();
    expect(screen.getByText(/Lizenz: CC BY-SA 4.0/)).toBeTruthy();
    expect(screen.queryByText("Bild ansehen (öffnet extern)")).toBeNull();
    expect(screen.queryByRole("button", { name: /Bild speichern/ })).toBeNull();
  });

  it("an unknown license reads unbekannt, it is not invented (P-08)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1]))),
    );
    render(
      <CandidateCard
        c={mockCandidate({ image: image(true, null) })}
        rank={1}
        photoAccess={ACCESS}
      />,
    );
    expect(await screen.findByText(/Lizenz: unbekannt/)).toBeTruthy();
  });

  it("an image that is not stored stays a link followed on purpose and offers to store it", async () => {
    const onStoreImage = vi.fn();
    render(
      <CandidateCard
        c={mockCandidate({ image: image(false) })}
        rank={1}
        photoAccess={ACCESS}
        onStoreImage={onStoreImage}
      />,
    );
    expect(screen.getByText("Bild ansehen (öffnet extern)")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Bild speichern: Geigenfeige (Ficus lyrata)" }),
    );
    expect(onStoreImage).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
  });

  it("without a handler or without an image there is no store action", () => {
    render(<CandidateCard c={mockCandidate({ image: image(false) })} rank={1} />);
    expect(screen.queryByRole("button", { name: /Bild speichern/ })).toBeNull();
    cleanup();
    render(<CandidateCard c={mockCandidate()} rank={1} onStoreImage={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Bild speichern/ })).toBeNull();
    expect(screen.getByText("Kein Bild")).toBeTruthy();
  });

  it("a failing load says why by the error code (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { code: "wish.image_not_found", text: "raw" } }), {
            status: 404,
          }),
      ),
    );
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    expect(await screen.findByText(/gibt es bei Wikimedia Commons nicht/)).toBeTruthy();
  });
});

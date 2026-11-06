// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate } from "@pflanzendex/core";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/wishes/w1/image?size=thumb");
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

  it("NFR-12 US-WUN-04 the card asks the API for the 256 px thumbnail of its stored image, not the full copy", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchFn);
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await screen.findByRole("img", { name: "Bild von Geigenfeige (Ficus lyrata)" });
    const pictureRequests = fetchFn.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("/image"));
    expect(pictureRequests).toEqual(["http://api/wishes/w1/image?size=thumb"]);
  });
});

const THUMB = "http://api/wishes/w1/image?size=thumb";
const FULL = "http://api/wishes/w1/image";
const PICTURE = "Bild von Geigenfeige (Ficus lyrata) groß anzeigen";
const DIALOG = "Bild von Geigenfeige (Ficus lyrata)";

/** Answers the thumbnail at once; the full copy (no size) gets `full`, so a test can hold it back or fail it. */
function routeFetch(
  full: () => Response | Promise<Response> = () => new Response(new Uint8Array([2])),
) {
  const fetchFn = vi.fn<typeof fetch>(async (input) =>
    String(input) === THUMB ? new Response(new Uint8Array([1])) : full(),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const requested = (fetchFn: ReturnType<typeof routeFetch>) =>
  fetchFn.mock.calls.map((call) => String(call[0])).filter((url) => url.includes("/image"));

describe("US-WUN-06 a stored picture opens large from the card", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:wish");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("the card asks only for the thumbnail; the full copy waits for the tap", async () => {
    const fetchFn = routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await screen.findByRole("button", { name: PICTURE });
    expect(requested(fetchFn)).toEqual([THUMB]);
  });

  it("a tap loads the full copy once and shows it large under the title Bild von …", async () => {
    const fetchFn = routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: PICTURE }));
    const dialog = await screen.findByRole("dialog", { name: DIALOG });
    await within(dialog).findByRole("img", { name: DIALOG });
    expect(requested(fetchFn).filter((url) => url === FULL)).toHaveLength(1);
  });

  it("the large view shows the loading text while the full copy is on its way", async () => {
    routeFetch(() => new Promise<Response>(() => undefined));
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: PICTURE }));
    const dialog = await screen.findByRole("dialog", { name: DIALOG });
    expect(within(dialog).getByRole("status").textContent).toBe("Bild wird geladen …");
  });

  it.each([360, 1024])(
    "US-WUN-06 Escape closes the large view and returns the focus to the picture (%i px)",
    async (width) => {
      setViewportWidth(width);
      routeFetch();
      render(
        <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
      );
      const picture = await screen.findByRole("button", { name: PICTURE });
      await userEvent.click(picture);
      await screen.findByRole("dialog", { name: DIALOG });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(picture));
    },
  );

  it.each([360, 1024])(
    "US-WUN-06 the close button closes the large view and returns the focus to the picture (%i px)",
    async (width) => {
      setViewportWidth(width);
      routeFetch();
      render(
        <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
      );
      const picture = await screen.findByRole("button", { name: PICTURE });
      await userEvent.click(picture);
      const dialog = await screen.findByRole("dialog", { name: DIALOG });
      await userEvent.click(within(dialog).getByRole("button", { name: "Schließen" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(picture));
    },
  );

  it("the picture opens by keyboard: Tab reaches it, Enter opens it", async () => {
    const fetchFn = routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    const picture = await screen.findByRole("button", { name: PICTURE });
    await userEvent.tab();
    await waitFor(() => expect(document.activeElement).toBe(picture));
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("dialog", { name: DIALOG });
    expect(requested(fetchFn)).toContain(FULL);
  });

  it("the source and the license stay on the card and show again in the large view", async () => {
    routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await screen.findByRole("button", { name: PICTURE });
    expect(screen.getByText(/Quelle: Anna Beispiel/)).toBeTruthy();
    expect(screen.getByText(/Lizenz: CC BY-SA 4.0/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: PICTURE }));
    const dialog = await screen.findByRole("dialog", { name: DIALOG });
    expect(within(dialog).getByText(/Quelle: Anna Beispiel/)).toBeTruthy();
    expect(within(dialog).getByText(/Lizenz: CC BY-SA 4.0/)).toBeTruthy();
  });

  it("reopening the large view does not fetch the full copy again while the cache has it", async () => {
    const fetchFn = routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: PICTURE }));
    const dialog = await screen.findByRole("dialog", { name: DIALOG });
    await within(dialog).findByRole("img", { name: DIALOG });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: PICTURE }));
    await screen.findByRole("dialog", { name: DIALOG });
    expect(requested(fetchFn).filter((url) => url === FULL)).toHaveLength(1);
  });

  it("the picture sits in a row next to the title and is 128 px wide (starting value, assumption)", async () => {
    routeFetch();
    render(
      <CandidateCard c={mockCandidate({ image: image(true) })} rank={1} photoAccess={ACCESS} />,
    );
    const picture = await screen.findByRole("button", { name: PICTURE });
    const title = screen.getByRole("heading", { name: "Geigenfeige (Ficus lyrata)" });
    const row = picture.closest(".flex");
    expect(row?.contains(title)).toBe(true);
    expect(picture.className).toContain("w-32");
  });

  it("without a stored picture there is no picture button and nothing opens large", () => {
    render(<CandidateCard c={mockCandidate()} rank={1} photoAccess={ACCESS} />);
    expect(screen.getByText("Kein Bild")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /groß anzeigen/ })).toBeNull();
    cleanup();
    render(
      <CandidateCard
        c={mockCandidate({ image: image(false) })}
        rank={1}
        photoAccess={ACCESS}
        onStoreImage={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Bild ansehen (öffnet extern)" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Bild speichern: Geigenfeige (Ficus lyrata)" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /groß anzeigen/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

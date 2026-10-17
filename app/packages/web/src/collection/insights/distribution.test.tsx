// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { LightZone, Distribution } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionPage } from "../collection-page/collection-page";
import { loadDistribution } from "./api/distribution-api";
import { DistributionView } from "./distribution-view/distribution-view";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = (n: number): LightZone => ({
  id: `z${n}`,
  name: `Lampe ${n}`,
  luxCeiling: 1000 * n,
  ppfd: null,
  sortOrder: n,
});
const distribution = (extra: Partial<Distribution> = {}): Distribution => ({
  zones: [
    { zone: zone(2), count: 3 },
    { zone: zone(3), count: 1 },
    { zone: zone(4), count: 1 },
  ],
  thinnest: [zone(3), zone(4)],
  notCounted: { cuttingLight: 0, archived: 0, zoneUnknown: 0 },
  hint: {
    text: "Lampe 3 und Lampe 4 sind gleich dünn besetzt (je 1).",
    nextAction: "Setze Arten für diese Zonen auf die Wunschliste.",
  },
  ...extra,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-14 the distribution inside the page card", () => {
  it("is a flat tinted surface without its own border or card fill", () => {
    render(<DistributionView distribution={distribution()} />);
    const box = screen.getByRole("region", { name: "Verteilung auf die Lichtzonen" });
    expect(box.className).toContain("bg-secondary");
    expect(box.className).not.toContain("border-border");
    expect(box.className).not.toContain("bg-card");
  });
});

describe("US-LIC-02 client of the distribution API", () => {
  it("loads the distribution with bearer token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(200, { distribution: distribution() }),
    );
    const r = await loadDistribution("http://api", "tok", fetchFn);
    expect(r).toMatchObject({ ok: true, value: { thinnest: [{ id: "z3" }, { id: "z4" }] } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/specimens/distribution");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("a server error stays an error with code, no empty distribution (P-10)", async () => {
    const error = { code: "server.error", text: "Nicht ladbar." };
    const fetchFn = vi.fn<typeof fetch>(async () => response(500, { error }));
    expect(await loadDistribution("http://api", "tok", fetchFn)).toMatchObject({
      ok: false,
      error: { code: "server.error" },
    });
  });
});

describe("US-LIC-02 view of the distribution", () => {
  it("shows the number of specimens per zone 2 to 4 and marks the thinnest zones", () => {
    render(<DistributionView distribution={distribution()} />);
    const list = screen.getByRole("list", { name: "Exemplare je Lichtzone" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((z) => z.textContent)).toEqual([
      expect.stringContaining("Lampe 2: 3 Exemplare"),
      expect.stringContaining("Lampe 3: 1 Exemplar"),
      expect.stringContaining("Lampe 4: 1 Exemplar"),
    ]);
    expect(rows[1]?.textContent).toContain("dünnste Zone");
    expect(rows[0]?.textContent).not.toContain("dünnste Zone");
  });

  it("names the thinnest zone and the next action (P-09), with a tie with a hint to the wishlist", () => {
    render(<DistributionView distribution={distribution()} />);
    expect(screen.getByText(/Lampe 3 und Lampe 4 sind gleich dünn besetzt/)).toBeTruthy();
    expect(screen.getByText(/auf die Wunschliste/)).toBeTruthy();
  });

  it("explains that cutting light does not count and names the specimens that were not counted (P-10)", () => {
    render(
      <DistributionView
        distribution={distribution({
          notCounted: { cuttingLight: 2, archived: 1, zoneUnknown: 3 },
        })}
      />,
    );
    const rest = screen.getByText(/Nicht mitgezählt/);
    expect(rest.textContent).toContain("2 unter Stecklingslicht");
    expect(rest.textContent).toContain("1 archiviert");
    expect(rest.textContent).toContain("3 mit unbekannter Zone");
  });

  it("US-BES-08 the note about unknown zones says where the incomplete specimens are named (P-09, P-10)", () => {
    render(
      <DistributionView
        distribution={distribution({
          notCounted: { cuttingLight: 2, archived: 1, zoneUnknown: 3 },
        })}
      />,
    );
    expect(screen.getByText(/Nicht mitgezählt/).textContent).toContain(
      "3 mit unbekannter Zone (siehe Hinweise)",
    );
  });

  it("US-BES-08 without unknown zones the note does not mention the hints", () => {
    render(
      <DistributionView
        distribution={distribution({
          notCounted: { cuttingLight: 2, archived: 0, zoneUnknown: 0 },
        })}
      />,
    );
    expect(screen.getByText(/Nicht mitgezählt/).textContent).not.toContain("Hinweise");
  });

  it("shows nothing about the not counted when everything is counted", () => {
    render(<DistributionView distribution={distribution()} />);
    expect(screen.queryByText(/Nicht mitgezählt/)).toBeNull();
  });

  it("without zones for adults: no list, only a hint with action", () => {
    render(
      <DistributionView
        distribution={distribution({
          zones: [],
          thinnest: [],
          hint: {
            text: "Es gibt keine Lichtzone für erwachsene Pflanzen.",
            nextAction: "Lege mindestens zwei Lichtzonen an.",
          },
        })}
      />,
    );
    expect(screen.queryByRole("list", { name: "Exemplare je Lichtzone" })).toBeNull();
    expect(screen.getByText(/Lege mindestens zwei Lichtzonen an/)).toBeTruthy();
  });
});

describe("US-QS-07 · DS-32 distribution bars", () => {
  const bars = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>("[data-bar]"));

  it("US-QS-07 · DS-32 the bar width is a CSS variable, not an inline width", () => {
    const { container } = render(<DistributionView distribution={distribution()} />);
    const found = bars(container);
    expect(found).toHaveLength(3);
    expect(found.every((b) => b.style.width === "")).toBe(true);
    expect(found[0]?.style.getPropertyValue("--value")).toBe("100");
    expect(Number(found[1]?.style.getPropertyValue("--value"))).toBeCloseTo(100 / 3, 5);
  });

  it("US-QS-07 · DS-32 a count of 0 renders an empty bar and the highest count a full one, nothing invented", () => {
    const { container } = render(
      <DistributionView
        distribution={distribution({
          zones: [
            { zone: zone(2), count: 0 },
            { zone: zone(3), count: 4 },
          ],
        })}
      />,
    );
    expect(bars(container).map((b) => b.style.getPropertyValue("--value"))).toEqual(["0", "100"]);
  });

  it("US-QS-07 · DS-32 with all counts 0 no bar is filled", () => {
    const { container } = render(
      <DistributionView
        distribution={distribution({
          zones: [{ zone: zone(2), count: 0 }],
        })}
      />,
    );
    expect(bars(container).map((b) => b.style.getPropertyValue("--value"))).toEqual(["0"]);
  });
});

describe("US-LIC-02 collection page shows the distribution", () => {
  const page = () => (
    <CollectionPage
      api="http://api"
      token={async () => "tok"}
      newSpecies={null}
      onSpeciesChoose={vi.fn()}
      onCompleted={vi.fn()}
    />
  );

  it("loads cards, locations and distribution and shows the distribution above the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/specimens/distribution")
          return response(200, { distribution: distribution() });
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        return response(200, { cards: [] });
      }),
    );
    render(page());
    expect(
      await screen.findByRole("heading", { name: "Verteilung auf die Lichtzonen" }),
    ).toBeTruthy();
    expect(screen.getByText(/Lampe 3 und Lampe 4 sind gleich dünn besetzt/)).toBeTruthy();
  });

  it('if the distribution fails, nothing is shown half: error text and "Erneut versuchen"', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/specimens/distribution")
          return response(500, {
            error: { code: "server.error", text: "Verteilung nicht ladbar." },
          });
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        return response(200, { cards: [] });
      }),
    );
    render(page());
    expect((await screen.findByRole("alert")).textContent).toContain("Verteilung nicht ladbar.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

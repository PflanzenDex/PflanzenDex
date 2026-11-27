// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapHistory, outcomeLine } from "./swap-history";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "../../swap.de.json";
import { SwapHistorySkeleton } from "./swap-history.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const entry = (extra: Record<string, unknown> = {}) => ({
  swapId: "s1",
  date: "2026-10-10T10:00:00.000Z",
  friend: "Ben",
  direction: "given",
  species: "Echte Aloe",
  type: "cutting",
  mode: "swap",
  status: "handed_over",
  reason: null,
  cause: null,
  specimenId: "g1",
  ...extra,
});
const server = (entries: unknown[]) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/swaps/history"
        ? response(200, { entries })
        : response(404, {}),
    ),
  );
const show = () =>
  render(
    <MemoryRouter>
      <SwapHistory api="http://api" token={token} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-13 swap history", () => {
  it("lists completed and ended swaps with date, friend, given or received, species and status", async () => {
    server([
      entry(),
      entry({
        swapId: "s2",
        direction: "received",
        friend: "Cleo",
        species: "Haworthie",
        mode: "give_away",
        type: "plant",
      }),
      entry({
        swapId: "s3",
        status: "declined",
        reason: "Zu klein",
        species: "Aloe",
        friend: "Dora",
      }),
      entry({
        swapId: "s4",
        status: "canceled",
        cause: "friendship_ended",
        species: null,
        friend: null,
      }),
    ]);
    show();
    const list = await screen.findByRole("list", { name: "Tauschverlauf" });
    const items = within(list)
      .getAllByRole("listitem")
      .map((i) => i.textContent ?? "");
    expect(items[0]).toContain("10.10.2026");
    expect(items[0]).toContain("Übergeben an Ben");
    expect(items[0]).toContain("Echte Aloe");
    expect(items[0]).toContain("Steckling · Tauschen");
    expect(items[1]).toContain("Erhalten von Cleo");
    expect(items[1]).toContain("Pflanze · Verschenken");
    // On a phone all four entries are in the one list, in order (US-QS-32); the paged view shows them in pages.
    expect(items).toHaveLength(4);
    expect(items[2]).toContain("Anfrage von Dora abgelehnt");
    expect(items[2]).toContain("Grund: Zu klein");
    expect(items[3]).toContain("Art unbekannt");
    expect(items[3]).toContain("Tausch mit einem Freund abgebrochen");
    for (const i of [items[2], items[3]])
      expect(i).not.toMatch(/Gegeben an|Erhalten von|Übergeben/);
    expect(items[3]).toContain("Ihr seid nicht mehr befreundet");
  });

  it("without any finished swap it says what happens here and what to do next (P-09)", async () => {
    server([]);
    show();
    expect(await screen.findByText(/Noch kein Tausch abgeschlossen/)).toBeTruthy();
  });

  it("is readable on its own, without the page: a heading and text, the status is a word not a colour", async () => {
    server([entry()]);
    show();
    expect(await screen.findByText("Übergeben an Ben")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tauschverlauf" })).toBeTruthy();
  });

  it("US-QS-32 the outcome stands once: no status badge repeats the line (SG-LIST-07, F-0366)", async () => {
    server([entry()]);
    show();
    await screen.findByText("Übergeben an Ben");
    expect(screen.queryByText("Übergeben")).toBeNull();
  });
});

describe("US-QS-14 issue 1697 · the swap history show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <SwapHistorySkeleton label={table["history.loading"]} />,
      table["history.loading"],
    ));
});

describe("US-SOZ-13 · US-QS-32 the history line follows the outcome (F-0366)", () => {
  it("US-SOZ-13 a declined, a withdrawn and a canceled swap never read Gegeben an or Erhalten von; a handed-over swap does", () => {
    const line = (status: string, direction: "given" | "received") =>
      outcomeLine({ status: status as never, direction }, "Ben");
    expect(line("handed_over", "given")).toBe("Übergeben an Ben");
    expect(line("handed_over", "received")).toBe("Erhalten von Ben");
    expect(line("declined", "given")).toBe("Anfrage von Ben abgelehnt");
    expect(line("declined", "received")).toBe("Anfrage an Ben abgelehnt");
    expect(line("withdrawn", "given")).toBe("Anfrage von Ben zurückgezogen");
    expect(line("withdrawn", "received")).toBe("Anfrage an Ben zurückgezogen");
    expect(line("canceled", "received")).toBe("Tausch mit Ben abgebrochen");
    for (const status of ["declined", "withdrawn", "canceled"])
      for (const d of ["given", "received"] as const)
        expect(line(status, d)).not.toMatch(/Gegeben an|Erhalten von|Übergeben/);
  });
});

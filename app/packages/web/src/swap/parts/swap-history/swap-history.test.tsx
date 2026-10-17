// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapHistory } from "./swap-history";

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
const show = () => render(<SwapHistory api="http://api" token={token} />);

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
    expect(items[0]).toContain("Gegeben an Ben");
    expect(items[0]).toContain("Echte Aloe");
    expect(items[0]).toContain("Steckling · Tauschen");
    expect(items[0]).toContain("Übergeben");
    expect(items[1]).toContain("Erhalten von Cleo");
    expect(items[1]).toContain("Pflanze · Verschenken");
    expect(items[2]).toContain("Abgelehnt");
    expect(items[2]).toContain("Grund: Zu klein");
    expect(items[3]).toContain("Art unbekannt");
    expect(items[3]).toContain("einem Freund");
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
    expect(await screen.findByText("Übergeben")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tauschverlauf" })).toBeTruthy();
  });
});

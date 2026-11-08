// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedBlock } from "./feed-block";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import table from "../../social.de.json";
import { FeedSkeleton } from "./feed-block.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const friends = [
  { id: "f1", name: "Anna" },
  { id: "f2", name: null },
];
const event = (extra: Record<string, unknown> = {}) => ({
  friendId: "f1",
  friendName: "Anna",
  type: "new_species",
  speciesLatin: "Haworthia fasciata",
  speciesGerman: "Zebra-Haworthie",
  date: "2026-10-04",
  count: 1,
  ...extra,
});
const feed = (
  events: unknown[],
  hint = { text: "Das ist neu.", nextAction: "Schau in die Sammlung." },
) => ({
  events,
  asOf: "2026-10-06T10:00:00.000Z",
  hint,
});

function server(body: unknown) {
  const fetchFn = vi.fn<typeof fetch>(async () => response(200, body));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const last = (fetchFn: ReturnType<typeof server>) =>
  new URL(String(fetchFn.mock.calls.at(-1)?.[0]));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-05 block 'Neu bei Freunden'", () => {
  it("US-SOZ-05 shows friend, species, date and type per event, with the hint (P-09)", async () => {
    server(
      feed([
        event(),
        event({
          type: "new_cutting",
          count: 3,
          date: null,
          friendName: null,
          speciesGerman: null,
          speciesLatin: null,
        }),
      ]),
    );
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    const list = await screen.findByRole("list", { name: "Neuigkeiten" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first?.textContent).toContain("Anna: 1 Pflanze Zebra-Haworthie (Haworthia fasciata)");
    expect(first?.textContent).toContain("Neue Art gefangen · 04.10.2026");
    expect(second?.textContent).toContain("Name unbekannt: 3 Pflanzen Art unbekannt");
    expect(second?.textContent).toContain("Neuer Steckling · Datum unbekannt");
    expect(screen.getByText("Schau in die Sammlung.")).toBeTruthy();
  });

  it("US-SOZ-05 loads the last 30 days by default and sends the filters to the server", async () => {
    const fetchFn = server(feed([]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    await screen.findByText("Das ist neu.");
    expect(last(fetchFn).searchParams.get("days")).toBe("30");
    expect(last(fetchFn).searchParams.get("timeZone")).toBeTruthy();
    // The filters open behind "Filter (n)" (issue 1157); n counts the ones that differ from the default.
    await userEvent.click(screen.getByRole("button", { name: "Filter (0)" }));
    await userEvent.selectOptions(screen.getByLabelText("Freund"), "f1");
    await userEvent.click(screen.getByRole("checkbox", { name: "Nur neue Arten" }));
    await userEvent.selectOptions(screen.getByLabelText("Zeitraum"), "7");
    await screen.findByText("Das ist neu.");
    const q = last(fetchFn).searchParams;
    expect([q.get("friend"), q.get("onlyNewSpecies"), q.get("days")]).toEqual(["f1", "true", "7"]);
    expect(screen.getByRole("button", { name: "Filter (3)" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("US-SOZ-05 · US-QS-15 · issue 1157 the filters are closed at first, next step and 'Stand' share one line, and the events page by the free height", async () => {
    server(feed([event()]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    const hint = (await screen.findByText("Das ist neu.")).closest("p") as HTMLElement;
    expect(hint.textContent).toContain("Stand: ");
    expect(screen.queryByLabelText("Freund")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter (0)" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.getByRole("list", { name: "Neuigkeiten" }).hasAttribute("data-page-fit")).toBe(
      true,
    );
  });

  it("US-SOZ-05 an empty feed still says what to do next", async () => {
    server(
      feed([], {
        text: "Du hast noch keine Freunde.",
        nextAction: "Lade jemanden mit einem Code ein.",
      }),
    );
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={[]} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Lade jemanden mit einem Code ein.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Neuigkeiten" })).toBeNull();
  });
});

describe("US-QS-14 issue 1697 · the feed show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(<FeedSkeleton label={table["feed.loading"]} />, table["feed.loading"]));
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedBlock } from "./feed-block";

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
    render(<FeedBlock api="http://api" token={token} friends={friends} />);
    const list = await screen.findByRole("list", { name: "Neuigkeiten" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first?.textContent).toContain("Anna: 1 Exemplar Zebra-Haworthie (Haworthia fasciata)");
    expect(first?.textContent).toContain("Neue Art gefangen · 04.10.2026");
    expect(second?.textContent).toContain("Name unbekannt: 3 Exemplare Art unbekannt");
    expect(second?.textContent).toContain("Neuer Steckling · Datum unbekannt");
    expect(screen.getByText("Schau in die Sammlung.")).toBeTruthy();
  });

  it("US-SOZ-05 loads the last 30 days by default and sends the filters to the server", async () => {
    const fetchFn = server(feed([]));
    render(<FeedBlock api="http://api" token={token} friends={friends} />);
    await screen.findByText("Das ist neu.");
    expect(last(fetchFn).searchParams.get("days")).toBe("30");
    expect(last(fetchFn).searchParams.get("timeZone")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Freund"), "f1");
    await userEvent.click(screen.getByRole("checkbox", { name: "Nur neue Arten" }));
    await userEvent.selectOptions(screen.getByLabelText("Zeitraum"), "7");
    await screen.findByText("Das ist neu.");
    const q = last(fetchFn).searchParams;
    expect([q.get("friend"), q.get("onlyNewSpecies"), q.get("days")]).toEqual(["f1", "true", "7"]);
  });

  it("US-SOZ-05 an empty feed still says what to do next", async () => {
    server(
      feed([], {
        text: "Du hast noch keine Freunde.",
        nextAction: "Lade jemanden mit einem Code ein.",
      }),
    );
    render(<FeedBlock api="http://api" token={token} friends={[]} />);
    expect(await screen.findByText("Lade jemanden mit einem Code ein.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Neuigkeiten" })).toBeNull();
  });
});

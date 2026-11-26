// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedBlock } from "./feed-block";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import { filledIn, hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import table from "../../social.de.json";
import { FeedSkeleton } from "./feed-block.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
/** The address of the page, so a test sees which layer a button opens (US-QS-32). */
const Where = () => <span data-testid="where">{useLocation().search}</span>;
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
  hint = { kind: "new", text: "Das ist neu.", nextAction: "Schau in die Sammlung." },
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
  vi.useRealTimers();
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
    // The hint is one plain line; its instruction has no link and is not shown (US-QS-32, F-0258).
    expect(screen.queryByText("Schau in die Sammlung.")).toBeNull();
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

  it("US-SOZ-05 · US-QS-15 · issue 1157 the filters are closed at first, and the events page by the free height", async () => {
    server(feed([event()]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    await screen.findByText("Das ist neu.");
    expect(screen.queryByLabelText("Freund")).toBeNull();
    expect(screen.getByRole("button", { name: "Filter (0)" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.getByRole("list", { name: "Neuigkeiten" }).hasAttribute("data-page-fit")).toBe(
      true,
    );
  });

  it("US-QS-32 FR-SOZ-03 a copy read today has no 'Stand' line; the hint above stays one plain line", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:05:00Z"));
    server(feed([event()]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    const hint = (await screen.findByText("Das ist neu.")).closest("p") as HTMLElement;
    expect(hint.textContent).toBe("Das ist neu.");
    expect(hint.querySelector("strong")).toBeNull();
    expect(screen.queryByText(/^Stand: /)).toBeNull();
    vi.useRealTimers();
  });

  it("US-QS-32 FR-SOZ-03 an older copy says so in its own muted line: 'Stand: gestern' for yesterday's copy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:05:00Z"));
    server({ ...feed([event()]), asOf: "2026-10-05T10:00:00.000Z" });
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    const asOf = await screen.findByText("Stand: gestern");
    expect(asOf.tagName).toBe("P");
    expect(asOf.className).toContain("text-muted-foreground");
    expect(asOf.className).not.toContain("font-semibold");
    expect(document.body.textContent).not.toContain("05.10.2026");
    vi.useRealTimers();
  });

  it("US-QS-32 FR-SOZ-03 a copy from days back shows its age in the summary form, 'Stand: vor 3 Tagen'", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:05:00Z"));
    server({ ...feed([event()]), asOf: "2026-10-03T10:00:00.000Z" });
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Stand: vor 3 Tagen")).toBeTruthy();
    vi.useRealTimers();
    vi.useRealTimers();
  });

  it("US-QS-32 F-0258 the instruction without a link is not shown; a state with no action shows the line alone", async () => {
    server(feed([event()]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    await screen.findByText("Das ist neu.");
    expect(screen.queryByText("Schau in die Sammlung.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Freund hinzufügen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Selbst etwas teilen" })).toBeNull();
  });

  it("US-QS-32 P-09 no friend yet: the line and 'Freund hinzufügen', which opens the add-friend layer", async () => {
    server(
      feed([], {
        kind: "no_friends",
        text: "Noch keine Freunde.",
        nextAction: "Lade jemanden ein.",
      }),
    );
    render(
      <MemoryRouter>
        <Where />
        <FeedBlock api="http://api" token={token} friends={[]} />
      </MemoryRouter>,
    );
    const hint = (await screen.findByText("Noch keine Freunde.")).closest("p") as HTMLElement;
    expect(hint.textContent).toBe("Noch keine Freunde.");
    expect(screen.queryByText("Lade jemanden ein.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Neuigkeiten" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Freund hinzufügen" }));
    expect(screen.getByTestId("where").textContent).toBe("?sheet=add");
  });

  it("US-QS-32 P-09 a friend shares nothing yet: 'Selbst etwas teilen' opens what friends see", async () => {
    server(
      feed([], {
        kind: "nothing_shared",
        text: "Deine Freunde teilen noch nichts.",
        nextAction: "Bitte sie.",
      }),
    );
    render(
      <MemoryRouter>
        <Where />
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Deine Freunde teilen noch nichts.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Selbst etwas teilen" }));
    expect(screen.getByTestId("where").textContent).toBe("?sheet=sharing");
  });

  it("US-QS-32 P-09 nothing new in the period offers no button; the filter above is the way on", async () => {
    server(
      feed([], {
        kind: "nothing_new",
        text: "Nichts Neues in diesem Zeitraum.",
        nextAction: "Filter.",
      }),
    );
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Nichts Neues in diesem Zeitraum.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Freund hinzufügen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Selbst etwas teilen" })).toBeNull();
  });
});

describe("US-QS-14 issue 1697 · the feed show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(<FeedSkeleton label={table["feed.loading"]} />, table["feed.loading"]));
});

describe("US-QS-32 · SG-BTN-01 the feed's actions are tinted, not outlined (owner decision 2026-11-16)", () => {
  it("US-QS-32 · SG-BTN-01 'Filter (n)' is a tinted button without a border, and the block has no filled button", async () => {
    server(feed([event()]));
    render(
      <MemoryRouter>
        <FeedBlock api="http://api" token={token} friends={friends} />
      </MemoryRouter>,
    );
    const filter = await screen.findByRole("button", { name: "Filter (0)" });
    expect(isTinted(filter)).toBe(true);
    expect(hasOwnBorder(filter)).toBe(false);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

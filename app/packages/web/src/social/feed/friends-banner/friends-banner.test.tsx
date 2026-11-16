// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, setProfileTimeZone } from "@/shared/data";
import { FriendsBanner } from "./friends-banner";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ASOF = "2026-10-06T10:00:00.000Z";
const banner = (extra: Record<string, unknown> = {}) => ({
  firstVisit: false,
  count: 3,
  asOf: ASOF,
  items: [
    {
      friendId: "f1",
      friendName: "Anna",
      speciesLatin: "Aloe vera",
      speciesGerman: "Echte Aloe",
      count: 2,
    },
    { friendId: "f2", friendName: null, speciesLatin: null, speciesGerman: null, count: 1 },
  ],
  ...extra,
});

function server(initial: unknown) {
  let current = initial;
  const posts: unknown[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST" && path === "/feed/seen") {
      posts.push(JSON.parse(String(init.body)));
      current = banner({ count: 0, items: [] });
      return response(200, { seenAt: ASOF });
    }
    return path === "/feed/banner" ? response(200, current) : response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { posts, fetchFn };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setProfileTimeZone(null);
});

/** Freezes the clock (Date only) at the given instant, so "Stand" is relative to a known day (US-QS-32). */
const clockAt = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

describe("US-SOZ-06 banner 'Friends have N new plants'", () => {
  it("US-SOZ-06 names friend and species, says 'Stand' and stays until 'Als gelesen markieren'", async () => {
    clockAt("2026-11-15T12:00:00Z");
    const { posts } = server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Freunde haben 3 neue Pflanzen:");
    expect(region.textContent).toContain("Anna: 2 × Echte Aloe, Name unbekannt: 1 × Art unbekannt");
    expect(region.textContent).toContain("Stand: 06.10.2026");
    await userEvent.click(screen.getByRole("button", { name: "Als gelesen markieren" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("region", { name: /Neu bei Freunden/ })).toBeNull(),
    );
    expect(posts).toEqual([{ upTo: ASOF }]);
  });

  it("US-SOZ-06 one new plant is singular", async () => {
    server(banner({ count: 1, items: [banner().items[0]] }));
    render(<FriendsBanner api="http://api" token={token} />);
    expect((await screen.findByRole("region")).textContent).toContain(
      "Freunde haben 1 neue Pflanze:",
    );
  });

  it("US-SOZ-06 the first visit shows no banner and marks the feed as seen silently", async () => {
    const { posts } = server(banner({ firstVisit: true, count: 0, items: [] }));
    render(<FriendsBanner api="http://api" token={token} />);
    await vi.waitFor(() => expect(posts).toEqual([{ upTo: ASOF }]));
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("US-SOZ-06 without news nothing is shown", async () => {
    const { fetchFn } = server(banner({ count: 0, items: [] }));
    render(<FriendsBanner api="http://api" token={token} />);
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("US-SOZ-06 a failed load says so on the page Freunde and stays quiet on the start page (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(500, {})),
    );
    const { unmount } = render(<FriendsBanner api="http://api" token={token} />);
    expect(await screen.findByText(/konnten gerade nicht geladen werden/)).toBeTruthy();
    unmount();
    const { container } = render(<FriendsBanner api="http://api" token={token} quiet />);
    await vi.waitFor(() => expect(container.textContent).toBe(""));
  });

  it("US-QS-32 SG-COPY-06 a failed 'Als gelesen markieren' shows the German text of its error code, not a generic sentence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (init?.method === "POST" && path === "/feed/seen")
          return response(403, { error: { code: "access.denied", text: "raw server text" } });
        return path === "/feed/banner" ? response(200, banner()) : response(404, {});
      }),
    );
    render(<FriendsBanner api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Als gelesen markieren" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Darauf hast du keinen Zugriff.");
    expect(screen.getByRole("region", { name: /Neu bei Freunden/ })).toBeTruthy();
  });

  it("US-SOZ-06 · US-QS-15 · issue 1157 the compact banner is one row with 'Als gelesen markieren' at its end and leaves 'Stand' to the feed", async () => {
    server(banner());
    render(<FriendsBanner api="http://api" token={token} compact />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.className).toContain("flex-wrap");
    expect(region.textContent).toContain("Freunde haben 3 neue Pflanzen:");
    expect(region.textContent).not.toContain("Stand:");
    expect(screen.getByRole("button", { name: "Als gelesen markieren" })).toBeTruthy();
  });
});

describe("US-QS-32 FR-SOZ-03 'Stand' of the banner: only an older copy says so, in calendar days of the keeper's zone", () => {
  it("US-QS-32 FR-SOZ-03 a copy read today shows no 'Stand'", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-06T10:05:00Z");
    server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Freunde haben 3 neue Pflanzen:");
    expect(region.textContent).not.toContain("Stand");
  });

  it("US-QS-32 FR-SOZ-03 a copy read at 23:30 local the evening before counts as 'Stand: gestern'", async () => {
    // 2026-11-14 23:30 Berlin is 22:30 UTC on the 14th; now is 2026-11-15 00:30 Berlin (23:30 UTC on the 14th).
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-11-14T23:30:00Z");
    server(banner({ asOf: "2026-11-14T22:30:00.000Z" }));
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Stand: gestern");
  });

  it("US-QS-32 FR-SOZ-03 a copy read at 00:30 local today, 23:30 UTC the day before, counts as today (no 'Stand')", async () => {
    // 2026-11-14 23:30 UTC is 2026-11-15 00:30 Berlin: the same local day as now (10:00 Berlin on the 15th).
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-11-15T09:00:00Z");
    server(banner({ asOf: "2026-11-14T23:30:00.000Z" }));
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).not.toContain("Stand");
    expect(region.textContent).not.toContain("gestern");
  });

  it("US-QS-32 FR-SOZ-03 a copy of yesterday says 'Stand: gestern'", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-07T12:00:00Z");
    server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Stand: gestern");
  });

  it("US-QS-32 FR-SOZ-03 an older copy shown without a network says 'Stand: vor 3 Tagen'", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-09T12:00:00Z");
    server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toMatch(/Stand: vor 3\u00a0Tagen/);
  });

  it("US-QS-32 FR-SOZ-03 offline, a copy of today still says 'Stand: heute' with the note about the missing connection", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-06T10:05:00Z");
    // The loaded copy is older than the stale time, so the view asks again; the network is down and the copy stays on screen.
    const client = createQueryClient();
    client.setQueryData(["social", "banner"], banner(), { updatedAt: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(
      <QueryClientProvider client={client}>
        <FriendsBanner api="http://api" token={token} />
      </QueryClientProvider>,
    );
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    // The copy shows at once; the failed refetch that makes it offline lands after that, so the test waits for it.
    await vi.waitFor(() =>
      expect(region.textContent).toContain(
        "Stand: heute (keine Verbindung, zuletzt geladener Stand)",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Als gelesen markieren" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("US-QS-32 FR-SOZ-03 the day of 'Stand' follows the profile's time zone, not the UTC date", async () => {
    // 2026-11-14 12:00 UTC: the 14th in Berlin, the 15th in Auckland. Now is 2026-11-15 10:00 UTC.
    clockAt("2026-11-15T10:00:00Z");
    const asOf = { asOf: "2026-11-14T12:00:00.000Z" };
    setProfileTimeZone("Europe/Berlin");
    server(banner(asOf));
    const first = render(<FriendsBanner api="http://api" token={token} />);
    expect((await screen.findByRole("region", { name: /Neu bei Freunden/ })).textContent).toContain(
      "Stand: gestern",
    );
    first.unmount();
    // In Auckland the copy (01:00 on the 15th) and now (23:00 on the 15th) are the same calendar day: no 'Stand'.
    setProfileTimeZone("Pacific/Auckland");
    server(banner(asOf));
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).not.toContain("Stand");
  });

  it("US-QS-32 FR-SOZ-03 an old copy from more than 7 days shows the absolute date", async () => {
    clockAt("2026-11-15T12:00:00Z");
    server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Stand: 06.10.2026");
  });
});

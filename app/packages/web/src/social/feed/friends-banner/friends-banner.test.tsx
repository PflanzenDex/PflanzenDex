// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});

describe("US-SOZ-06 banner 'Friends have N new plants'", () => {
  it("US-SOZ-06 names friend and species, says 'Stand' and stays until 'Okay'", async () => {
    const { posts } = server(banner());
    render(<FriendsBanner api="http://api" token={token} />);
    const region = await screen.findByRole("region", { name: /Neu bei Freunden/ });
    expect(region.textContent).toContain("Freunde haben 3 neue Pflanzen:");
    expect(region.textContent).toContain("Anna: 2 × Echte Aloe, Name unbekannt: 1 × Art unbekannt");
    expect(region.textContent).toContain("Stand: 06.10.2026");
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
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
});

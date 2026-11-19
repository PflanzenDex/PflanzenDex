// @vitest-environment jsdom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { createQueryClient, setProfileTimeZone, SCREEN_STALE_TIME } from "../../../shared/data";
import { FriendsBanner } from "../friends-banner/friends-banner";
import { FriendsNewsLayer, FriendsNewsTile } from "./friends-news";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ASOF = "2026-10-06T10:00:00.000Z";
const CLARA = {
  friendId: "f1",
  friendName: "Clara",
  speciesLatin: null,
  speciesGerman: "Glücksfeder",
  count: 1,
};
/** The banner of the API: `count` new plants (`items`) and the plants read within the window (`read`, US-SOZ-06). */
const banner = (count: number, read: unknown[] = []) => ({
  firstVisit: false,
  count,
  asOf: ASOF,
  items: count === 0 ? [] : [{ ...CLARA, count }],
  read,
});
const LARS = {
  friendId: "f2",
  friendName: "Lars",
  speciesLatin: "Monstera deliciosa",
  speciesGerman: null,
  count: 1,
};
/**
 * Two friends with new plants (US-QS-32): Clara has two species (2 × Glücksfeder, 1 Efeutute), Lars one. `read` are the
 * plants read within the window, as the API gives them.
 */
const twoFriends = (read: unknown[] = []) => ({
  firstVisit: false,
  count: 4,
  asOf: ASOF,
  items: [
    { ...CLARA, count: 2 },
    { ...CLARA, speciesLatin: "Epipremnum aureum", speciesGerman: null, count: 1 },
    LARS,
  ],
  read,
});

/**
 * A stub of the banner endpoint and of the mark: a mark moves what was new into `read`, as the core does (US-SOZ-06).
 * Every mark is recorded in `posts`.
 */
function server(initial: unknown) {
  let current = initial as ReturnType<typeof banner>;
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path === "/feed/seen") {
        posts.push(JSON.parse(String(init.body)));
        current = {
          ...current,
          count: 0,
          items: [],
          read: [...current.items, ...current.read],
        };
        return response(200, { seenAt: ASOF });
      }
      return path === "/feed/banner" ? response(200, current) : response(404, {});
    }),
  );
  return { posts };
}

/**
 * A stub whose first mark fails: `status` is a refusal of the server, `throw` a dropped connection. Later marks work as
 * in `server`, so a later close can send again (US-SOZ-06, P-10).
 */
function serverFailingFirstMark(initial: ReturnType<typeof banner>, how: "status" | "throw") {
  let current = initial;
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path === "/feed/seen") {
        posts.push(JSON.parse(String(init.body)));
        if (posts.length === 1) {
          if (how === "throw") throw new TypeError("Failed to fetch");
          return response(500, { error: { code: "system.unexpected", text: "raw" } });
        }
        current = {
          ...current,
          count: 0,
          items: [],
          read: [...current.items, ...current.read],
        };
        return response(200, { seenAt: ASOF });
      }
      return path === "/feed/banner" ? response(200, current) : response(404, {});
    }),
  );
  return { posts };
}

function Address() {
  const { search } = useLocation();
  return <output aria-label="Adresse">{search}</output>;
}

/** The tile as "Heute" draws it (count and name in one button) and its layer. */
function Today({ at = "/today" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={["/start", at]} initialIndex={1}>
      <FriendsNewsTile
        api="http://api"
        token={token}
        tile={(n, label, layer) => (
          <LayerOpener id={layer}>
            {n} {label}
          </LayerOpener>
        )}
      />
      <FriendsNewsLayer api="http://api" token={token} />
      <Address />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-18 · US-SOZ-06 the new plants of friends are a tile on Heute (issue 1156)", () => {
  it("US-QS-18 · US-SOZ-06 the tile names the count and opens a layer with friend, species and 'Stand'; the layer has no 'Als gelesen markieren'", async () => {
    const { posts } = server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(within(layer).getByRole("button", { name: "Clara (1)" })).toBeTruthy();
    expect(within(layer).getByRole("link", { name: "Glücksfeder" })).toBeTruthy();
    expect(layer.textContent).toContain("Stand: 06.10.2026");
    expect(within(layer).queryByRole("button", { name: "Als gelesen markieren" })).toBeNull();
    // Opening marks nothing: the news are marked read when the layer closes (US-SOZ-06, P4-C3).
    expect(posts).toEqual([]);
  });

  it("US-SOZ-06 closing the layer marks what it showed as read, with the asOf of that copy", async () => {
    const { posts } = server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(posts).toEqual([{ upTo: ASOF }]));
    expect(await screen.findByRole("button", { name: "0 Neu bei Freunden" })).toBeTruthy();
  });

  it("US-SOZ-06 the read plants stay reachable: the tile still opens the layer, which shows them under 'Gelesen'", async () => {
    server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(await screen.findByRole("button", { name: "0 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(layer.textContent).toContain("Gerade nichts Neues von Freunden.");
    // Without new plants "Gelesen" is the only choice, so it is the one shown (US-QS-32).
    expect(within(layer).getByRole("button", { name: "Gelesen (1)" })).toBeTruthy();
    expect(within(layer).getByRole("link", { name: /Glücksfeder.*Clara/ })).toBeTruthy();
    expect(within(layer).queryByRole("button", { name: "Als gelesen markieren" })).toBeNull();
  });

  it("US-SOZ-06 leaving Heute with the layer still open (an unmount) marks what it showed as read; opening it marks nothing", async () => {
    const { posts } = server(banner(1));
    const view = render(<Today at="/today?sheet=news" />);
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await vi.waitFor(() =>
      expect(within(layer).getByRole("link", { name: "Glücksfeder" })).toBeTruthy(),
    );
    expect(posts).toEqual([]);
    view.unmount();
    await vi.waitFor(() => expect(posts).toEqual([{ upTo: ASOF }]));
  });

  it("US-SOZ-06 a refused mark leaves the plants new, says so in a toast, and a later close sends again", async () => {
    const { posts } = serverFailingFirstMark(banner(1), "status");
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText(/sind nicht als gelesen markiert/)).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(await screen.findByRole("button", { name: "1 Neu bei Freunden" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ upTo: ASOF });
    expect(await screen.findByRole("button", { name: "0 Neu bei Freunden" })).toBeTruthy();
  });

  it("US-SOZ-06 a mark that cannot reach the server is caught: a toast, the plants stay new, and a later close sends again", async () => {
    const { posts } = serverFailingFirstMark(banner(1), "throw");
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByText(/sind nicht als gelesen markiert/)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(posts).toHaveLength(2));
  });

  it("US-SOZ-06 a second close with nothing new marks nothing again", async () => {
    const { posts } = server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    await userEvent.click(await screen.findByRole("button", { name: "0 Neu bei Freunden" }));
    await userEvent.keyboard("{Escape}");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts).toHaveLength(1);
  });

  it("US-SOZ-06 offline (FR-SOZ-03) leaving the layer marks nothing: the mark needs a connection", async () => {
    const client = createQueryClient();
    client.setQueryData(["social", "banner"], banner(1), { updatedAt: 0 });
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        if (init?.method === "POST") posts.push(init.body);
        throw new TypeError("Failed to fetch");
      }),
    );
    render(
      <QueryClientProvider client={client}>
        <Today />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await vi.waitFor(() => expect(layer.textContent).toContain("keine Verbindung"));
    await userEvent.keyboard("{Escape}");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts).toEqual([]);
  });

  it("US-SOZ-06 with read plants only, the tile stays and counts the new ones: 0", async () => {
    server(banner(0, [CLARA]));
    render(<Today />);
    expect(await screen.findByRole("button", { name: "0 Neu bei Freunden" })).toBeTruthy();
  });

  it("US-SOZ-06 ?sheet=news with only read plants stays open and shows them under 'Gelesen'", async () => {
    server(banner(0, [CLARA]));
    render(<Today at="/today?sheet=news" />);
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(await within(layer).findByRole("button", { name: "Gelesen (1)" })).toBeTruthy();
    // The open dialog hides the rest of the page from the accessibility tree, so the address is read by its label.
    expect(screen.getByLabelText("Adresse").textContent).toBe("?sheet=news");
  });

  it("US-QS-18 · US-SOZ-06 without news there is no tile", async () => {
    server(banner(0));
    render(<Today />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US-QS-18 ?sheet=news with nothing new is taken out of the address instead of showing an empty layer", async () => {
    server(banner(0));
    render(<Today at="/today?sheet=news" />);
    await vi.waitFor(() =>
      expect(screen.getByRole("status", { name: "Adresse" }).textContent).toBe(""),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-18 · US-SOZ-12 on Heute the banner leaves the new plants to the tile", async () => {
    server(banner(2));
    render(<FriendsBanner api="http://api" token={token} quiet news={false} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("region", { name: /Neu bei Freunden/ })).toBeNull();
  });
});

describe("US-QS-32 FR-SOZ-03 'Stand' in the layer on Heute: only an older copy says so", () => {
  afterEach(() => {
    vi.useRealTimers();
    setProfileTimeZone(null);
  });

  /** Freezes the clock (Date only) at the given instant, as the banner tests do. */
  const clockAt = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  it("US-QS-32 FR-SOZ-03 the layer on Heute shows no 'Stand' for a copy read today, and no 'Als gelesen markieren'", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-06T10:05:00Z");
    server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(within(layer).getByRole("link", { name: "Glücksfeder" })).toBeTruthy();
    expect(layer.textContent).not.toContain("Stand");
    expect(within(layer).queryByRole("button", { name: "Als gelesen markieren" })).toBeNull();
  });

  it("US-QS-32 FR-SOZ-03 the layer on Heute says 'Stand: gestern' for a copy of yesterday", async () => {
    setProfileTimeZone("Europe/Berlin");
    clockAt("2026-10-07T12:00:00Z");
    server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(layer.textContent).toContain("Stand: gestern");
  });
});

/** A stub whose banner answers only when the test releases it, so the layer is seen while it loads (US-QS-32). */
function gatedServer(initial: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path !== "/feed/banner") return response(404, {});
      await gate;
      return response(200, initial);
    }),
  );
  return { release };
}

/** The layer on its own route, so following a row (a link to a friend's collection) unmounts it, as the app does. */
function Routed() {
  return (
    <MemoryRouter initialEntries={["/today?sheet=news"]}>
      <Routes>
        <Route path="/today" element={<FriendsNewsLayer api="http://api" token={token} />} />
        <Route path="/friends/:friendId" element={<p>Sammlung von Clara</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("US-QS-32 the layer on Heute is flat grouped rows: one choice per friend, rows per species (issue 2198)", () => {
  it("US-QS-32 one choice per friend with the count of its plants; choosing one shows a row per species, 'N ×' for more than one plant", async () => {
    server(twoFriends());
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "4 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(within(layer).getByRole("button", { name: "Clara (3)" })).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Lars (1)" })).toBeTruthy();
    expect(within(layer).getByRole("link", { name: "Glücksfeder 2 ×" })).toBeTruthy();
    expect(within(layer).getByRole("link", { name: "Epipremnum aureum" })).toBeTruthy();
    expect(within(layer).queryByRole("link", { name: /Monstera/ })).toBeNull();
    await userEvent.click(within(layer).getByRole("button", { name: "Lars (1)" }));
    expect(within(layer).getByRole("link", { name: "Monstera deliciosa" })).toBeTruthy();
    expect(within(layer).queryByRole("link", { name: /Glücksfeder/ })).toBeNull();
  });

  it("US-QS-32 the choices keep the order of the banner, and 'Gelesen' comes last with the friend's name in its rows", async () => {
    server(twoFriends([LARS]));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "4 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    const group = within(layer).getByRole("group", { name: "Gruppen der Neuigkeiten" });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Clara (3)", "Lars (1)", "Gelesen (1)"]);
    await userEvent.click(within(layer).getByRole("button", { name: "Gelesen (1)" }));
    expect(within(layer).getByRole("link", { name: /Monstera deliciosa.*Lars/ })).toBeTruthy();
    expect(within(layer).queryByRole("link", { name: /Glücksfeder/ })).toBeNull();
  });

  it("US-QS-32 closing the layer after a choice leaves no choice or page in the address, so the next opening starts at the first choice", async () => {
    const { posts } = server(twoFriends());
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "4 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.click(within(layer).getByRole("button", { name: "Lars (1)" }));
    expect(screen.getByLabelText("Adresse").textContent).toBe("?sheet=news&part=friend-f2");
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Adresse").textContent).toBe("");
    await userEvent.click(await screen.findByRole("button", { name: "0 Neu bei Freunden" }));
    const again = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(await within(again).findByRole("button", { name: "Gelesen (4)" })).toBeTruthy();
  });

  it("US-QS-32 · US-SOZ-06 a row links to the friend's collection, and following it marks what the layer showed as read, once", async () => {
    const { posts } = server(banner(1));
    render(<Routed />);
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    const link = await within(layer).findByRole("link", { name: "Glücksfeder" });
    expect(link.getAttribute("href")).toBe("/friends/f1");
    await userEvent.click(link);
    expect(await screen.findByText("Sammlung von Clara")).toBeTruthy();
    await vi.waitFor(() => expect(posts).toEqual([{ upTo: ASOF }]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posts).toHaveLength(1);
  });

  it("US-QS-32 while the banner loads, the layer shows a hidden skeleton of its final shape, and it goes when the banner arrives", async () => {
    const { release } = gatedServer(twoFriends());
    render(<Today at="/today?sheet=news" />);
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await vi.waitFor(() => expect(layer.querySelector("[data-news-skeleton]")).not.toBeNull());
    expect(layer.querySelector("[data-news-skeleton]")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(layer).queryByRole("link")).toBeNull();
    release();
    await within(layer).findByRole("link", { name: "Glücksfeder 2 ×" });
    expect(layer.querySelector("[data-news-skeleton]")).toBeNull();
  });
});

describe("NFR-12 Heute asks for the news of friends once on a cold start (issue 1291)", () => {
  const bannerReads = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => new URL(String(url)).pathname === "/feed/banner")
      .length;

  /** The layer mounts first; the tile follows when its chunk has loaded, after the answer is there. */
  function ColdStart({ client, tile }: { client: QueryClient; tile: boolean }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/today"]}>
          <FriendsNewsLayer api="http://api" token={token} />
          {tile && (
            <FriendsNewsTile
              api="http://api"
              token={token}
              tile={(n, label, layer) => (
                <LayerOpener id={layer}>
                  {n} {label}
                </LayerOpener>
              )}
            />
          )}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  async function layerAnswered(client: QueryClient) {
    const view = render(<ColdStart client={client} tile={false} />);
    await vi.waitFor(() => expect(client.getQueryData(["social", "banner"])).toBeDefined());
    return view;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("NFR-12 a tile that mounts after the answer of the layer reads the same copy, one request", async () => {
    server(banner(1));
    const client = createQueryClient();
    const view = await layerAnswered(client);
    view.rerender(<ColdStart client={client} tile />);
    await screen.findByRole("button", { name: "1 Neu bei Freunden" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(bannerReads()).toBe(1);
  });

  it("NFR-12 · US-SOZ-06 closing the layer after its news reads the banner again at once, so the mark shows", async () => {
    server(banner(1));
    const client = createQueryClient();
    const view = await layerAnswered(client);
    view.rerender(<ColdStart client={client} tile />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "0 Neu bei Freunden" })).toBeTruthy(),
    );
    expect(bannerReads()).toBe(2);
  });

  it("NFR-12 · US-SOZ-06 coming back after the window asks again, so new plants of friends show", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    server(banner(1));
    const client = createQueryClient();
    const view = await layerAnswered(client);
    view.unmount();
    vi.setSystemTime(Date.now() + SCREEN_STALE_TIME + 1);
    render(<ColdStart client={client} tile />);
    await vi.waitFor(() => expect(bannerReads()).toBe(2));
  });
});

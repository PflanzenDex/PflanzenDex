// @vitest-environment jsdom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { createQueryClient, SCREEN_STALE_TIME } from "../../../shared/data";
import { FriendsBanner } from "../friends-banner/friends-banner";
import { FriendsNewsLayer, FriendsNewsTile } from "./friends-news";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const ASOF = "2026-10-06T10:00:00.000Z";
const banner = (count: number) => ({
  firstVisit: false,
  count,
  asOf: ASOF,
  items:
    count === 0
      ? []
      : [
          {
            friendId: "f1",
            friendName: "Clara",
            speciesLatin: null,
            speciesGerman: "Glücksfeder",
            count,
          },
        ],
});

function server(initial: unknown) {
  let current = initial;
  const posts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path === "/feed/seen") {
        posts.push(JSON.parse(String(init.body)));
        current = banner(0);
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
  it("US-QS-18 · US-SOZ-06 the tile names the count and opens a layer with friend, species, 'Stand' and 'Okay'", async () => {
    const { posts } = server(banner(1));
    render(<Today />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(layer.textContent).toContain("Freunde haben 1 neue Pflanze: Clara: 1 × Glücksfeder");
    expect(layer.textContent).toContain("Stand: 06.10.2026");
    await userEvent.click(within(layer).getByRole("button", { name: "Okay" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual([{ upTo: ASOF }]);
    expect(screen.queryByRole("button", { name: /Neu bei Freunden/ })).toBeNull();
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

  it("NFR-12 · US-SOZ-06 'Okay' still reads again at once inside the window", async () => {
    server(banner(1));
    const client = createQueryClient();
    const view = await layerAnswered(client);
    view.rerender(<ColdStart client={client} tile />);
    await userEvent.click(await screen.findByRole("button", { name: "1 Neu bei Freunden" }));
    const layer = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    await userEvent.click(within(layer).getByRole("button", { name: "Okay" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: /Neu bei Freunden/ })).toBeNull(),
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

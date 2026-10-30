// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient, WRITE_SUCCEEDED } from "../../kernel";
import { AchievementNewsBanner } from "./news-banner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const fresh = (id: string) => ({ id, earnedOn: "2026-07-01", specimenName: null });

/** The news the server answers; `news` can be changed between requests. */
function server(first: unknown) {
  const state = { news: first as unknown, posts: [] as unknown[], status: 200 };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "POST") {
        state.posts.push(JSON.parse(String(init.body)));
        return reply(200, { seen: [] });
      }
      expect(new URL(String(url)).pathname).toBe("/achievements/news");
      return reply(state.status, state.news);
    }),
  );
  return state;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AchievementNewsBanner api="http://api" token={token} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const none = { calmMode: false, fresh: [], acknowledge: [], needsWrite: false };

describe("US-ACH-03 quiet achievement banner", () => {
  it("US-ACH-03 shows the banner with a link after a successful action made an achievement new", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    s.news = { ...none, fresh: [fresh("cutting-rooted")] };
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toContain("Erfolg: Steckling bewurzelt");
    expect(screen.getByRole("link", { name: "Zu den Erfolgen" }).getAttribute("href")).toBe(
      "/account/achievements",
    );
    expect(s.posts).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-03 a missed moment is no banner: what was already new at the start is left to the overview", async () => {
    server({ ...none, fresh: [fresh("cutting-rooted")] });
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-03 the first evaluation creates the state silently with the earned ones and shows nothing", async () => {
    const s = server({
      calmMode: false,
      fresh: [],
      acknowledge: ["cutting-rooted"],
      needsWrite: true,
    });
    show();
    await waitFor(() =>
      expect(s.posts).toEqual([{ achievements: ["cutting-rooted"], timeZone: expect.any(String) }]),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-08 calm mode shows nothing", async () => {
    server({ calmMode: true });
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACH-03 a read error breaks nothing and shows no banner", async () => {
    const s = server({ error: { code: "system.unexpected" } });
    s.status = 500;
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

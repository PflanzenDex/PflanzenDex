// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { createQueryClient, WRITE_SUCCEEDED } from "../../../../shared/data";
import { AchievementNewsBanner, NoticeSlot } from "./lazy-news-banner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const none = { calmMode: false, fresh: [], acknowledge: [], needsWrite: false };

function app(withSlot: boolean) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <AnnouncerProvider>
        <MemoryRouter>
          <AchievementNewsBanner api="http://api" token={async () => "tok"} />
          {withSlot ? <NoticeSlot /> : null}
        </MemoryRouter>
      </AnnouncerProvider>
    </QueryClientProvider>
  );
}

describe("US-QS-32 · F-0070 the shell's notice is drawn into the slot of Heute while that page is open", () => {
  it("US-QS-32 · F-0070 the slot registers itself: the notice appears in it, and leaves with the page", async () => {
    const state = { news: none as unknown };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => reply(state.news)),
    );
    const view = render(app(true));
    const slot = document.querySelector(".peer") as HTMLElement;
    expect(slot.matches(":empty")).toBe(true);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    state.news = {
      ...none,
      fresh: [{ id: "cutting-rooted", earnedOn: "2026-07-01", specimenName: null }],
    };
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    expect((await screen.findByRole("region", { name: "Erfolg" })).parentElement).toBe(slot);
    view.rerender(app(false));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull());
    // The notice is still known: the next Heute shows it again, and the live region said it once.
    view.rerender(app(true));
    expect(await screen.findByRole("region", { name: "Erfolg" })).toBeTruthy();
  });
});

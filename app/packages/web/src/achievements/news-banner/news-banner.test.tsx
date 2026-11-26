// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { createQueryClient, WRITE_SUCCEEDED } from "../../shared/data";
import { LINE_HIT } from "@/shared/feedback/line-hit";
import { AchievementNewsBanner } from "./news-banner";
import { hasOwnBorder, isPlain } from "@/shared/ui/button.roles";

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
/**
 * The page the app wires (F-0070): a line under the title of "Heute" that is the notice's place, and the banner that
 * fills it. `slotted` false is any other page: no such line.
 */
function Page(props: { slotted: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <>
      <div ref={props.slotted ? setSlot : undefined} data-notice-slot="" />
      <AchievementNewsBanner api="http://api" token={token} slot={slot} />
    </>
  );
}
function Switch() {
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOn(true)}>
        Heute
      </button>
      <button type="button" onClick={() => setOn(false)}>
        Andere Seite
      </button>
      <Page slotted={on} />
    </>
  );
}
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AnnouncerProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
const show = () => wrap(<Page slotted />);
/** What the shared live region says (DS-69). */
const said = () => document.querySelector(".sr-only[aria-live=polite]")?.textContent?.trim() ?? "";
const notice = () => screen.findByRole("region", { name: "Erfolg" });
const none = { calmMode: false, fresh: [], acknowledge: [], needsWrite: false };

describe("US-ACH-03 quiet achievement banner", () => {
  it("US-ACH-03 shows the banner with a link after a successful action made an achievement new", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    s.news = { ...none, fresh: [fresh("cutting-rooted")] };
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    const banner = await notice();
    expect(banner.textContent).toContain("Erfolg: Steckling bewurzelt");
    expect(screen.getByRole("link", { name: "Zu den Erfolgen" }).getAttribute("href")).toBe(
      "/account/achievements",
    );
    expect(s.posts).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
  });

  it("US-ACH-03 a missed moment is no banner: what was already new at the start is left to the overview", async () => {
    server({ ...none, fresh: [fresh("cutting-rooted")] });
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
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
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
  });

  it("US-ACH-08 calm mode shows nothing", async () => {
    server({ calmMode: true });
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
  });

  it("US-ACH-03 a read error breaks nothing and shows no banner", async () => {
    const s = server({ error: { code: "system.unexpected" } });
    s.status = 500;
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-QS-32 · SG-BTN-01 the achievement banner: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Schließen' is a plain button without a border", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    s.news = { ...none, fresh: [fresh("cutting-rooted")] };
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
    await notice();
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(isPlain(close)).toBe(true);
    expect(hasOwnBorder(close)).toBe(false);
  });
});

describe("US-QS-32 · F-0070 · SG-FEED-05 the achievement notice takes a place under the title of Heute and moves nothing", () => {
  const earn = async (s: ReturnType<typeof server>) => {
    s.news = { ...none, fresh: [fresh("cutting-rooted")] };
    await act(async () => void window.dispatchEvent(new Event(WRITE_SUCCEEDED)));
  };

  it("US-QS-32 · F-0070 the notice stands in the slot under the title, not above the page: the slot is empty at rest and again when closed", async () => {
    const s = server(none);
    show();
    const slot = document.querySelector("[data-notice-slot]") as HTMLElement;
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // `:empty` is what hides the slot and lets the summary line show (peer variants in `TodayOverview`).
    expect(slot.matches(":empty")).toBe(true);
    await earn(s);
    expect((await notice()).parentElement).toBe(slot);
    expect(slot.matches(":empty")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(slot.matches(":empty")).toBe(true);
  });

  it("US-QS-32 · F-0070 · SG-FEED-04 the notice is announced once through the live region and is no live region itself (SG-FEED-02)", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await earn(s);
    const region = await notice();
    expect(said()).toBe("Erfolg: Steckling bewurzelt");
    expect(region.hasAttribute("role")).toBe(false);
    expect(region.querySelector("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(screen.getByRole("link", { name: "Zu den Erfolgen" })).toBeTruthy();
  });

  it("US-QS-32 · F-0070 · SG-FEED-04 on a page without the slot nothing shows and nothing is said; Heute then shows it and says it once, also when it is opened again", async () => {
    const s = server(none);
    wrap(<Switch />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await earn(s);
    // Nothing on screen, nothing announced: the live region says what the page shows (4.1.3).
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await act(async () => void (await new Promise((done) => setTimeout(done, 50))));
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
    expect(said()).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Heute" }));
    expect((await notice()).textContent).toContain("Erfolg: Steckling bewurzelt");
    expect(said()).toBe("Erfolg: Steckling bewurzelt");
    // Leaving "Heute" and coming back shows the notice again; it is not said a second time.
    await userEvent.click(screen.getByRole("button", { name: "Andere Seite" }));
    expect(screen.queryByRole("region", { name: "Erfolg" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Heute" }));
    expect(await notice()).toBeTruthy();
    expect(said()).toBe("Erfolg: Steckling bewurzelt");
  });

  it("US-QS-32 · F-0070 the notice is a single line of text with its two controls, no box: nothing is framed or padded around it", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await earn(s);
    const region = await notice();
    const classes = region.className.split(" ");
    expect(classes).not.toContain("border");
    expect(classes.filter((c) => /^p[xy]?-\d/.test(c) || /^m[b]?-\d/.test(c))).toEqual([]);
  });

  it("US-ACH-03 · US-QS-12 · issue 2466 at 200 % text the controls wrap inside the notice: the margin of 'Schließen' is in lh, so a row of it keeps its height and no row runs under another", async () => {
    const s = server(none);
    show();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await earn(s);
    const region = await notice();
    // The row of the notice may wrap (flex-wrap); the button hangs over its line by half the difference to 44 px, in lh.
    expect(region.className.split(" ")).toContain("flex-wrap");
    const close = screen.getByRole("button", { name: "Schließen" });
    expect(close.className.split(" ")).toContain(LINE_HIT);
    expect(close.className.split(" ")).not.toContain("-my-3");
    expect(LINE_HIT).toContain("1lh");
  });
});

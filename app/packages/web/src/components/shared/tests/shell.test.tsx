// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app-shell";
import { GlobalHeader } from "../global-header";
import { MobileNavBar } from "../mobile-nav-bar";
import { SideNav } from "../side-nav/side-nav";
import type { NavItem } from "../nav-item";

beforeAll(() => {
  // jsdom has no matchMedia, Vaul reads it.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const icon = <svg aria-hidden="true" />;
const make = (n: number): NavItem[] =>
  Array.from({ length: n }, (_, i) => ({
    href: i === 0 ? "/" : `/p${i}`,
    label: `Ziel ${i}`,
    icon,
  }));

const at = (path: string, ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("MobileNavBar (US-QS-07, DS-25, DS-22, DS-44)", () => {
  it("US-QS-07 · DS-25 shows at most 5 destinations in the bar, the rest sit behind Mehr", () => {
    at("/", <MobileNavBar items={make(9)} />);
    const bar = screen.getByRole("navigation", { name: "Navigation unten" });
    expect(within(bar).getAllByRole("link")).toHaveLength(4);
    expect(within(bar).getByRole("button", { name: "Mehr" })).toBeTruthy();
  });

  it("US-QS-07 · DS-25 shows up to 5 destinations without a Mehr button", () => {
    at("/", <MobileNavBar items={make(5)} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Mehr" })).toBeNull();
  });

  it("US-QS-07 · DS-25 every target keeps a 44 px hit area and the bar is hidden from md", () => {
    at("/", <MobileNavBar items={make(9)} />);
    for (const el of [
      ...screen.getAllByRole("link"),
      screen.getByRole("button", { name: "Mehr" }),
    ]) {
      expect(el.className).toContain("min-h-[44px]");
      expect(el.className).toContain("min-w-[44px]");
    }
    expect(screen.getByRole("navigation", { name: "Navigation unten" }).className).toContain(
      "md:hidden",
    );
  });

  it("US-QS-07 · DS-22 the bar content sits above the safe area", () => {
    at("/", <MobileNavBar items={make(3)} />);
    expect(screen.getByRole("navigation", { name: "Navigation unten" }).className).toContain(
      "pb-[env(safe-area-inset-bottom)]",
    );
  });

  it("US-QS-07 · DS-25 lists the remaining destinations in the drawer", async () => {
    at("/", <MobileNavBar items={make(9)} />);
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    const drawer = await screen.findByRole("dialog", { name: "Mehr" });
    expect(within(drawer).getAllByRole("link")).toHaveLength(5);
  });

  it("US-QS-07 · DS-25 Esc closes the drawer and focus returns to the Mehr button", async () => {
    at("/", <MobileNavBar items={make(9)} />);
    const more = screen.getByRole("button", { name: "Mehr" });
    await userEvent.click(more);
    expect(screen.getByRole("dialog", { name: "Mehr" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("US-QS-07 · DS-19 marks the active destination by aria-current and a text change, not color alone", () => {
    at("/p2", <MobileNavBar items={make(4)} />);
    const active = screen.getByRole("link", { name: "Ziel 2" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("text-foreground");
    expect(active.firstElementChild?.className).toContain("bg-accent");
    expect(screen.getByRole("link", { name: "Ziel 1" }).getAttribute("aria-current")).toBeNull();
  });

  it("US-QS-14 · DS-25 marks Mehr active when the current page is in the drawer", () => {
    at("/p8", <MobileNavBar items={make(9)} />);
    const more = screen.getByRole("button", { name: "Mehr" });
    expect(more.className).toContain("text-foreground");
    expect(more.firstElementChild?.className).toContain("bg-accent");
  });

  it("US-QS-07 · DS-44 takes plain items and renders their labels and hrefs", () => {
    at("/", <MobileNavBar items={make(2)} />);
    expect(screen.getByRole("link", { name: "Ziel 1" }).getAttribute("href")).toBe("/p1");
  });
});

describe("GlobalHeader (US-QS-07, US-QS-14, DS-25)", () => {
  it("US-QS-14 · DS-25 the header is hidden from md and carries only the brand, the rail or sidebar take over", () => {
    at("/p1", <GlobalHeader />);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("md:hidden");
    expect(within(header).queryByRole("navigation")).toBeNull();
    expect(
      screen.getByRole("link", { name: "PflanzenDéx, zur Startseite" }).getAttribute("href"),
    ).toBe("/");
  });
});

const rail = () => screen.getByRole("navigation", { name: "Navigation seitlich" });
const sidebar = () => screen.getByRole("navigation", { name: "Hauptnavigation" });

describe("SideNav, rail (US-QS-14, DS-25, DS-44)", () => {
  it("US-QS-14 · shows from md up to below xl, 80 px wide, with all destinations and no Mehr", () => {
    at("/", <SideNav items={make(9)} />);
    expect(rail().className).toContain("md:flex");
    expect(rail().className).toContain("xl:hidden");
    expect(rail().className).toContain("w-20");
    expect(within(rail()).getAllByRole("link", { name: /^Ziel/ })).toHaveLength(9);
    expect(within(rail()).queryByRole("button", { name: "Mehr" })).toBeNull();
  });

  it("US-QS-14 · DS-19 the active item has the accent pill, a foreground label and aria-current", () => {
    at("/p2", <SideNav items={make(4)} />);
    const active = within(rail()).getByRole("link", { name: "Ziel 2" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("text-foreground");
    expect(active.firstElementChild?.className).toContain("bg-accent");
    const other = within(rail()).getByRole("link", { name: "Ziel 1" });
    expect(other.getAttribute("aria-current")).toBeNull();
    expect(other.className).toContain("text-muted-foreground");
  });

  it("US-QS-14 · DS-15 every target keeps a 44 px hit area and the brand link goes home", () => {
    at("/", <SideNav items={make(3)} />);
    for (const link of within(rail()).getAllByRole("link", { name: /^Ziel/ }))
      expect(link.className).toContain("min-h-[44px]");
    expect(
      within(rail())
        .getByRole("link", { name: "PflanzenDéx, zur Startseite" })
        .getAttribute("href"),
    ).toBe("/");
  });
});

describe("SideNav, sidebar (US-QS-14, DS-25, DS-44)", () => {
  it("US-QS-14 · shows from xl, 248 px wide, with the product name and all destinations", () => {
    at("/", <SideNav items={make(9)} />);
    expect(sidebar().className).toContain("xl:flex");
    expect(sidebar().className).toContain("w-[248px]");
    expect(within(sidebar()).getByText("PflanzenDéx")).toBeTruthy();
    expect(within(sidebar()).getAllByRole("link", { name: /^Ziel/ })).toHaveLength(9);
  });

  it("US-QS-14 · DS-19 the active item has the accent fill, a visible forced-colours border and aria-current", () => {
    at("/p1", <SideNav items={make(3)} />);
    const active = within(sidebar()).getByRole("link", { name: "Ziel 1" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("bg-accent");
    expect(active.className).toContain("font-semibold");
    expect(active.className).toContain("forced-colors:border-[color:Highlight]");
    expect(
      within(sidebar()).getByRole("link", { name: "Ziel 2" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("US-QS-14 · DS-15 every item is at least 44 px high and reachable by keyboard", async () => {
    at("/", <SideNav items={make(3)} />);
    const links = within(sidebar()).getAllByRole("link");
    for (const link of links) expect(link.className).toContain("min-h-[44px]");
    for (const link of links) {
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    await userEvent.keyboard("{Enter}");
  });

  it("US-QS-14 · the destination list scrolls on its own and a hairline separates the first four from the rest", () => {
    at("/", <SideNav items={make(9)} />);
    for (const nav of [rail(), sidebar()]) {
      expect(nav.className).toContain("h-dvh");
      expect(nav.className).toContain("overflow-hidden");
      const list = nav.querySelector("div");
      expect(list?.className).toContain("overflow-y-auto");
      expect(list?.className).toContain("scroll-py-3");
    }
    const divider = within(sidebar()).getByRole("separator");
    expect(divider.className).toContain("border-border");
    expect(divider.previousElementSibling?.textContent).toBe("Ziel 3");
    expect(within(rail()).queryByRole("separator")).toBeNull();
  });

  it("US-QS-14 · show forces one form visible for stories and tests", () => {
    at("/", <SideNav items={make(2)} show="rail" />);
    expect(rail().className).toContain("flex");
    expect(sidebar().className).toContain("hidden");
  });
});

describe("AppShell (US-QS-07, DS-21, DS-22, DS-25)", () => {
  it("US-QS-07 · DS-21 fills the dynamic viewport and avoids horizontal scroll", () => {
    const { container } = at("/", <AppShell items={make(9)}>Inhalt</AppShell>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("min-h-dvh");
    expect(root.className).toContain("overflow-x-hidden");
    expect(root.className).not.toMatch(/h-screen|100vh/);
  });

  it("US-QS-14 · DS-22 main keeps bottom padding for the sticky bar and safe area, gutters 16, 24 and 40 px", () => {
    at("/", <AppShell items={make(9)}>Inhalt</AppShell>);
    const main = screen.getByRole("main");
    expect(main.textContent).toBe("Inhalt");
    expect(main.className).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(main.className).toContain("md:pb-6");
    for (const gutter of ["px-4", "md:px-6", "xl:px-10"]) expect(main.className).toContain(gutter);
  });

  it("US-QS-14 · DS-25 renders bar, rail and sidebar from the one list; the bar holds at most five slots", () => {
    at("/", <AppShell items={make(9)}>x</AppShell>);
    const bar = screen.getByRole("navigation", { name: "Navigation unten" });
    expect(bar.className).toContain("md:hidden");
    expect(within(bar).getAllByRole("link").length + 1).toBeLessThanOrEqual(5);
    expect(within(rail()).getAllByRole("link", { name: /^Ziel/ })).toHaveLength(9);
    expect(within(sidebar()).getAllByRole("link", { name: /^Ziel/ })).toHaveLength(9);
  });
});

describe("US-QS-08 Operable by keyboard alone (app shell)", () => {
  it("US-QS-08 · 2.4.1 the first Tab reaches the skip link, which moves the focus to the main content", async () => {
    at("/", <AppShell items={make(9)}>Inhalt</AppShell>);
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Zum Inhalt springen" });
    expect(document.activeElement).toBe(skip);
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("US-QS-08 · 2.4.1 after the skip link the next Tab lands in the content, past the navigation", async () => {
    at(
      "/",
      <AppShell items={make(9)}>
        <button type="button">Im Inhalt</button>
      </AppShell>,
    );
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Im Inhalt" }));
  });

  it("US-QS-08 · 2.4.7 the skip link is hidden until focused and then shows a focus ring", () => {
    at("/", <AppShell items={make(3)}>x</AppShell>);
    const skip = screen.getByRole("link", { name: "Zum Inhalt springen" });
    expect(skip.className).toContain("sr-only");
    expect(skip.className).toContain("focus:not-sr-only");
    expect(skip.className).toContain("focus-visible:ring-2");
    // DS-15: a 44 px target once it shows; no padding while hidden, so it stays a 1 px sr-only box.
    expect(skip.className).toContain("focus:min-h-[44px]");
    expect(skip.className).not.toMatch(/(^| )p[xy]?-\d/);
  });

  it("US-QS-08 · 2.4.11 the page keeps scroll padding for the sticky header and the bottom bar", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const height = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return { height: this.tagName === "HEADER" ? 52 : 68 } as DOMRect;
      });
    const { unmount } = at("/", <AppShell items={make(9)}>x</AppShell>);
    // US-QS-14: 8 px more than the bars, so a focus ring (2 px ring, 2 px offset) of the focused element stays clear.
    expect(document.documentElement.style.scrollPaddingTop).toBe("60px");
    expect(document.documentElement.style.scrollPaddingBottom).toBe("76px");
    unmount();
    expect(document.documentElement.style.scrollPaddingTop).toBe("");
    height.mockRestore();
    vi.unstubAllGlobals();
  });

  it("US-QS-14 · 2.4.11 no extra scroll padding where the bars are hidden (rail and sidebar)", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const height = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ height: 0 }) as DOMRect);
    const { unmount } = at("/", <AppShell items={make(9)}>x</AppShell>);
    expect(document.documentElement.style.scrollPaddingTop).toBe("0px");
    expect(document.documentElement.style.scrollPaddingBottom).toBe("0px");
    unmount();
    height.mockRestore();
    vi.unstubAllGlobals();
  });

  it("US-QS-08 · 2.1.2 choosing a destination in the Mehr drawer closes it, so no overlay keeps the focus", async () => {
    at("/", <MobileNavBar items={make(9)} />);
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    const drawer = await screen.findByRole("dialog", { name: "Mehr" });
    within(drawer).getByRole("link", { name: "Ziel 6" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("AppShell offline banner (US-QS-14, P-09, P-10)", () => {
  it("US-QS-14 shows a banner while the device is offline and removes it when it is back", () => {
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    at("/", <AppShell items={make(3)}>Inhalt</AppShell>);
    expect(screen.getByText("Du bist offline")).toBeTruthy();
    state.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(screen.queryByText("Du bist offline")).toBeNull();
    state.mockRestore();
  });

  it("US-QS-14 shows no banner while the device is online", () => {
    at("/", <AppShell items={make(3)}>Inhalt</AppShell>);
    expect(screen.queryByText("Du bist offline")).toBeNull();
  });
});

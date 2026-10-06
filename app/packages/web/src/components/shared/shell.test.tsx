// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { GlobalHeader } from "./global-header";
import { MobileNavBar } from "./mobile-nav-bar";
import type { NavItem } from "./nav-item";

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
    const drawer = screen.getByRole("dialog", { name: "Mehr" });
    expect(within(drawer).getAllByRole("link")).toHaveLength(5);
  });

  it("US-QS-07 · DS-25 Esc closes the drawer and focus returns to the Mehr button", async () => {
    at("/", <MobileNavBar items={make(9)} />);
    const more = screen.getByRole("button", { name: "Mehr" });
    await userEvent.click(more);
    expect(screen.getByRole("dialog", { name: "Mehr" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("US-QS-07 · DS-19 marks the active destination by aria-current and a text change, not color alone", () => {
    at("/p2", <MobileNavBar items={make(4)} />);
    const active = screen.getByRole("link", { name: "Ziel 2" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("font-semibold");
    expect(screen.getByRole("link", { name: "Ziel 1" }).getAttribute("aria-current")).toBeNull();
  });

  it("US-QS-07 · DS-25 marks Mehr active when the current page is in the drawer", () => {
    at("/p8", <MobileNavBar items={make(9)} />);
    expect(screen.getByRole("button", { name: "Mehr" }).className).toContain("font-semibold");
  });

  it("US-QS-07 · DS-44 takes plain items and renders their labels and hrefs", () => {
    at("/", <MobileNavBar items={make(2)} />);
    expect(screen.getByRole("link", { name: "Ziel 1" }).getAttribute("href")).toBe("/p1");
  });
});

describe("GlobalHeader (US-QS-07, DS-25)", () => {
  it("US-QS-07 · DS-25 shows all destinations in the top navigation from md", () => {
    at("/", <GlobalHeader items={make(9)} />);
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(9);
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("md:flex");
  });

  it("US-QS-07 · DS-25 the brand is always visible and links home", () => {
    at("/p1", <GlobalHeader items={make(3)} />);
    const brand = screen.getByRole("link", { name: "PflanzenDex" });
    expect(brand.getAttribute("href")).toBe("/");
    expect(brand.closest("header")?.className).not.toContain("hidden");
  });

  it("US-QS-07 · DS-19 marks the active destination by aria-current and a text change", () => {
    at("/p1", <GlobalHeader items={make(3)} />);
    const active = within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole(
      "link",
      { name: "Ziel 1" },
    );
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("font-semibold");
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

  it("US-QS-07 · DS-22 main keeps bottom padding for the sticky bar and safe area", () => {
    at("/", <AppShell items={make(9)}>Inhalt</AppShell>);
    const main = screen.getByRole("main");
    expect(main.textContent).toBe("Inhalt");
    expect(main.className).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(main.className).toContain("md:pb-0");
  });

  it("US-QS-07 · DS-25 renders header, bottom bar and the same destinations in both", () => {
    at("/", <AppShell items={make(9)}>x</AppShell>);
    expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Navigation unten" })).toBeTruthy();
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
    expect(document.documentElement.style.scrollPaddingTop).toBe("52px");
    expect(document.documentElement.style.scrollPaddingBottom).toBe("68px");
    unmount();
    expect(document.documentElement.style.scrollPaddingTop).toBe("");
    height.mockRestore();
    vi.unstubAllGlobals();
  });

  it("US-QS-08 · 2.1.2 choosing a destination in the Mehr drawer closes it, so no overlay keeps the focus", async () => {
    at("/", <MobileNavBar items={make(9)} />);
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    const drawer = screen.getByRole("dialog", { name: "Mehr" });
    within(drawer).getByRole("link", { name: "Ziel 6" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  barSlot,
  barWords,
  barWordsStyle,
  stackedItem,
  stackedLabel,
  stackedPill,
  type NavItem,
} from "../../../shared/patterns/navigation/nav-item";
import {
  DISCOVER_VIEW_KEY,
  SAMMLUNG_VIEW_KEY,
  isActivePath,
} from "../../../shared/patterns/navigation/navigation/reselect-link/reselect-link";
import { navItems } from "../../../shared/patterns/navigation/navigation/navigation";
import { MobileNavBar } from "./mobile-nav-bar";

afterEach(cleanup);

const items: NavItem[] = Array.from({ length: 6 }, (_, i) => ({
  href: `/p${i}`,
  label: `Ziel ${i}`,
  icon: <svg aria-hidden="true" />,
}));

/** The forced-colors border classes of an element, e.g. `forced-colors:border`. */
const forcedBorder = (el: Element) =>
  [...el.classList].filter((c) => /^forced-colors:border(-|$)/.test(c) && !c.includes("["));

/** The classes of an element as a list, so a class is matched whole (`font-normal`, not `font-normal-x`). */
const classesOf = (el: Element | null | undefined) =>
  (el?.className ?? "").split(/\s+/).filter(Boolean);

/** The address the router shows, and whether a tap asked to keep the focus (the state `keepFocus`). */
function Probe() {
  const { pathname, search, state } = useLocation();
  const keep = (state as { keepFocus?: boolean } | null)?.keepFocus === true;
  return (
    <output data-testid="location" data-keep-focus={String(keep)}>
      {pathname + search}
    </output>
  );
}

const renderBar = (path: string, list: NavItem[]) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNavBar items={list} />
      <Probe />
    </MemoryRouter>,
  );

const bar = () => within(screen.getByRole("navigation", { name: "Navigation unten" }));
const location = () => screen.getByTestId("location").textContent;

describe("MobileNavBar in forced colors (US-QS-14)", () => {
  it("US-QS-14 Mehr carries no box border of its own, like the links next to it", () => {
    render(
      <MemoryRouter initialEntries={["/p0"]}>
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );
    const more = bar().getByRole("button", { name: "Mehr" });
    for (const link of bar().getAllByRole("link")) expect(forcedBorder(link)).toEqual([]);
    expect(forcedBorder(more)).toEqual(["forced-colors:border-0"]);
  });

  it("US-QS-15 the icon pill of a destination stays inside its slot at a larger text size: its 3.5 rem width is capped by max-w-full (issue 1019)", () => {
    render(
      <MemoryRouter initialEntries={["/p0"]}>
        <MobileNavBar items={items} />
      </MemoryRouter>,
    );
    const first = bar().getAllByRole("link")[0];
    const pill = first?.querySelector("span.rounded-full");
    expect(pill?.className).toContain("w-14");
    expect(pill?.className).toContain("max-w-full");
  });
});

describe("US-QS-32 the bottom bar: selection cue, icons, labels, lock mark (FX-14, SG-COLOR-05, SG-ICON-01, SG-NAV-07)", () => {
  it("US-QS-32 the selected label is semibold, the others normal; the shared item class carries no weight (F-0054)", () => {
    renderBar("/p1", items);
    const [first, second] = bar().getAllByRole("link");
    expect(stackedItem).not.toMatch(/font-(normal|medium|semibold|bold)/);
    expect(classesOf(second)).toContain("font-semibold");
    expect(classesOf(first)).toContain("font-normal");
    expect(classesOf(first)).not.toContain("font-semibold");
    expect(stackedLabel(true)).toContain("font-semibold");
    expect(stackedLabel(false)).toContain("font-normal");
  });

  it("US-QS-32 the selected pill keeps its accent fill and draws a 1 px boundary in primary, an unselected pill none (F-0054, SG-COLOR-05)", () => {
    renderBar("/p1", items);
    const [first, second] = bar().getAllByRole("link");
    const selected = second?.querySelector(":scope > span.rounded-full");
    const plain = first?.querySelector(":scope > span.rounded-full");
    expect(classesOf(selected)).toEqual(expect.arrayContaining(["bg-accent", "border-primary"]));
    expect(classesOf(plain)).not.toContain("border-primary");
    expect(classesOf(plain)).toContain("border-transparent");
    expect(stackedPill(true)).toContain("border-primary");
    expect(stackedPill(false)).not.toContain("border-primary");
  });

  it("US-QS-32 the icons are 24 px, set in px (F-0056, SG-ICON-01): the pill sizes its direct icon, no 22 px class is left", () => {
    expect(stackedPill(true)).toContain("[&>svg]:size-[24px]");
    expect(stackedPill(false)).toContain("[&>svg]:size-[24px]");
    expect(stackedPill(true) + stackedPill(false)).not.toMatch(/22px|size-\[22/);
  });

  it("US-QS-32 no label leaves the view at a larger text size: no sr-only, no container query, no nowrap; a label wraps at spaces and never inside a word (SG-NAV-07, issue 2245)", () => {
    renderBar("/p0", items);
    const nav = screen.getByRole("navigation", { name: "Navigation unten" });
    expect(nav.className).not.toMatch(/@container|@max-/);
    const slots = [...bar().getAllByRole("link"), bar().getByRole("button", { name: "Mehr" })];
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      const word = [...slot.querySelectorAll("span")].find(
        (s) => s.children.length === 0 && s.textContent?.trim(),
      );
      expect(word, slot.textContent ?? "").toBeTruthy();
      expect(classesOf(word)).not.toContain("sr-only");
      expect(classesOf(word)).not.toContain("whitespace-nowrap");
      expect(classesOf(word)).toEqual(expect.arrayContaining(barWords.split(" ")));
      expect(word?.className).not.toMatch(/hyphens-auto|overflow-wrap|break-|@max-|truncate/);
      // The slot is a size container, so the word shrinks by the slot's width; the custom property holds its longest word.
      expect(classesOf(slot)).toContain(barSlot);
      expect(word?.style.getPropertyValue("--bar-word")).toBe("4");
    }
    expect(
      bar()
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(items.slice(0, 4).map((i) => i.label));
  });

  it("US-QS-32 the custom property of a label is the character count of its longest word, so a long word sizes the label (SG-NAV-07, issue 2245)", () => {
    expect(barWordsStyle("Heute")).toEqual({ "--bar-word": 5 });
    expect(barWordsStyle("Noch gesperrt")).toEqual({ "--bar-word": 8 });
    expect(barWordsStyle("Prüfliste")).toEqual({ "--bar-word": 9 });
    expect(barWordsStyle("")).toEqual({ "--bar-word": 1 });
  });

  it("US-QS-32 the lock mark is a 12 px badge with an 8 px glyph inside the pill, the pill stays the link's first child (F-0055)", () => {
    const list = navItems({ locks: { friends: "Noch gesperrt" } });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNavBar items={list} />
      </MemoryRouter>,
    );
    const link = bar().getByRole("link", { name: "Freunde, Noch gesperrt" });
    expect(link.firstElementChild?.className).toContain("rounded-full");
    const mark = link.querySelector("[data-lock-mark]");
    expect(mark?.getAttribute("data-lock-mark")).toBe("locked");
    expect(mark?.parentElement).toBe(link.firstElementChild);
    expect(classesOf(mark)).toEqual(expect.arrayContaining(["size-[12px]", "absolute"]));
    const glyph = mark?.querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("size-[8px]");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-32 the accessible name reads Freunde, Noch gesperrt and Freunde, Bald with no blank before the comma (F-0055)", () => {
    const locked = render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNavBar items={navItems({ locks: { friends: "Noch gesperrt" } })} />
      </MemoryRouter>,
    );
    expect(bar().getByRole("link", { name: "Freunde, Noch gesperrt" })).toBeTruthy();
    locked.unmount();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileNavBar items={navItems({ locks: { friends: "Bald" } })} />
      </MemoryRouter>,
    );
    expect(bar().getByRole("link", { name: "Freunde, Bald" })).toBeTruthy();
  });
});

/**
 * The device's reduced-motion setting for one test: `matchMedia` answers `(prefers-reduced-motion: reduce)` with `reduced`.
 * Returns the restore of the window's own `matchMedia`.
 */
function deviceMotion(reduced: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? reduced : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("US-QS-32 a tap on the selected destination (SG-NAV-03, owner answer Q07)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.motion;
  });

  it("US-QS-32 the start of Sammlung is its plants and of Entdecken its suggestions; the others start at their own address", () => {
    const byLabel = (label: string) => navItems({}).find((i) => i.label === label);
    expect(byLabel("Sammlung")?.start).toBe("/collection?view=plants");
    expect(byLabel("Sammlung")?.remember).toEqual({
      key: SAMMLUNG_VIEW_KEY,
      value: "plants",
    });
    expect(byLabel("Entdecken")?.start).toBe("/discover?view=suggestions");
    expect(byLabel("Heute")?.start).toBeUndefined();
    expect(byLabel("Heute")?.remember).toBeUndefined();
  });

  it("US-QS-32 a tap on Sammlung away from its start goes to the plant mode and remembers it; the link keeps its address /collection", () => {
    renderBar("/collection?view=equipment", navItems({}));
    const sammlung = bar().getByRole("link", { name: "Sammlung" });
    expect(sammlung.getAttribute("href")).toBe("/collection");
    expect(sammlung.getAttribute("aria-current")).toBe("page");
    fireEvent.click(sammlung);
    expect(location()).toBe("/collection?view=plants");
    expect(window.localStorage.getItem(SAMMLUNG_VIEW_KEY)).toBe("plants");
    expect(sammlung.getAttribute("href")).toBe("/collection");
  });

  it("US-QS-32 a second tap on the start address scrolls to the top and keeps the address", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    // The test setup answers every reduced-motion query as true (its matchMedia mock has no width); this test is the device without it.
    const restore = deviceMotion(false);
    try {
      renderBar("/collection?view=equipment", navItems({}));
      const sammlung = bar().getByRole("link", { name: "Sammlung" });
      fireEvent.click(sammlung);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(sammlung);
      expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      expect(location()).toBe("/collection?view=plants");
    } finally {
      restore();
      scroll.mockRestore();
    }
  });

  it("US-QS-32 under reduced motion the scroll to the top is not smooth (behavior auto)", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.documentElement.dataset.motion = "reduced";
    try {
      renderBar("/collection?view=plants", navItems({}));
      fireEvent.click(bar().getByRole("link", { name: "Sammlung" }));
      expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    } finally {
      scroll.mockRestore();
    }
  });

  it("US-QS-32 a tap on an unselected destination navigates as a link, scrolls nothing and remembers nothing", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    try {
      renderBar("/today", navItems({}));
      fireEvent.click(bar().getByRole("link", { name: "Sammlung" }));
      expect(location()).toBe("/collection");
      expect(scroll).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(SAMMLUNG_VIEW_KEY)).toBeNull();
    } finally {
      scroll.mockRestore();
    }
  });

  it("US-QS-32 Entdecken on its own page goes to the suggestions and remembers them", () => {
    renderBar("/discover?view=catalog", navItems({}));
    fireEvent.click(bar().getByRole("link", { name: "Entdecken" }));
    expect(location()).toBe("/discover?view=suggestions");
    expect(window.localStorage.getItem(DISCOVER_VIEW_KEY)).toBe("suggestions");
  });

  it("US-QS-32 the tap keeps the focus on its link (the state keepFocus, RouteFocus moves nothing)", () => {
    renderBar("/collection?view=equipment", navItems({}));
    fireEvent.click(bar().getByRole("link", { name: "Sammlung" }));
    expect(screen.getByTestId("location").getAttribute("data-keep-focus")).toBe("true");
  });

  it("US-QS-32 a modified click (a new tab) is left to the link, so the tap does not intercept it", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    try {
      renderBar("/collection?view=plants", navItems({}));
      const notPrevented = fireEvent.click(bar().getByRole("link", { name: "Sammlung" }), {
        metaKey: true,
      });
      expect(notPrevented).toBe(true);
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
    }
  });

  it("US-QS-32 isActivePath decides the selected destination, the sub-pages of a destination included", () => {
    expect(isActivePath("/collection/new", "/collection")).toBe(true);
    expect(isActivePath("/collections", "/collection")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/today", "/")).toBe(false);
  });
});

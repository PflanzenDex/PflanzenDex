// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { likelySignedIn } from "@/account";
import { navItems, PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import {
  barSlot,
  barWords,
  bottomBar,
  DISCOVER_VIEW_KEY,
  topBar,
} from "@/shared/patterns/navigation/nav-item";
import { routeFallbackOf } from "@/app/destinations/area-parts/simple-routes/route-fallback/route-fallback";
import { DiscoverRouteSkeleton } from "@/app/destinations/discover-area/discover-area.skeleton";
import { FriendsRouteSkeleton } from "@/app/destinations/area-parts/simple-routes/route-fallback/route-skeletons/route-skeletons";
import { barSlotsOf } from "../../mobile-nav-bar/bar-slots";
import { GlobalHeader } from "../../global-header/global-header";
import { MobileNavBar } from "../../mobile-nav-bar/mobile-nav-bar";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { beginAppStart } from "@/shared/ui/skeleton.delayed";
import { BAR_LABELS_KEY } from "./bar-labels";
import {
  AppBarSlotProvider,
  useAppBarSlot,
} from "@/shared/patterns/navigation/page-header/app-bar-slot/app-bar-slot";
import { TodaySkeleton } from "@/today";
import type { ReactNode } from "react";
import { StartFrame, StartPageSkeleton } from "./start-frame";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => setViewportWidth(360));

/** The top bar of a frame: the element that carries the bar's own class string. */
function topBarOf(container: HTMLElement): HTMLElement | undefined {
  return Array.from(container.querySelectorAll("div")).find((d) => d.className === topBar);
}

/** The classes of an element as a list, so a class is matched whole. */
const classesOf = (el: Element) => el.className.split(/\s+/).filter(Boolean);

/** Renders the frame at the start of the app (the skeleton shows at once, SG-STATE-02) and ends the start after the test. */
function startingAt(path: string) {
  const end = beginAppStart();
  const view = frameAt(path);
  return { ...view, end };
}

function frameAt(path: string, body?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StartFrame {...(body === undefined ? {} : { body })} />
    </MemoryRouter>,
  );
}

describe("US-QS-32 one loading picture from the app start to the page (SG-STATE-02, F-0060, issue 1876)", () => {
  it("US-QS-32 · SG-STATE-02 the start frame draws both bars with the boxes of the shell and the page skeleton in main", () => {
    const end = beginAppStart();
    try {
      const { container } = frameAt("/collection");
      expect(screen.getByRole("main")).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1, name: "Sammlung" })).toBeTruthy();
      // The page skeleton shows at once at the start (Q-27): one status with its loading text.
      expect(screen.getAllByRole("status")).toHaveLength(1);
      const bar = container.querySelector("[data-start-bar]");
      expect(bar?.className).toContain("tall-window:fixed");
      expect(bar?.getAttribute("aria-hidden")).toBe("true");
      // The slots of both text sizes: five at each, Entdecken and the large "Mehr" in one of them (issue 2249).
      expect(bar?.children).toHaveLength(6);
    } finally {
      end();
    }
  });

  it("US-QS-32 · SG-STATE-02 the start frame holds no control: the bars are drawn, not operable", () => {
    frameAt("/");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("US-QS-32 a device with a kept, live sign-in likely opens signed in; an expired or missing one does not", () => {
    const key = "oidc.user:https://id.example:pflanzendex";
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, JSON.stringify({ expires_at: Date.now() / 1000 - 60 }));
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, "kein JSON");
    expect(likelySignedIn()).toBe(false);
    window.localStorage.setItem(key, JSON.stringify({ expires_at: Date.now() / 1000 + 3600 }));
    expect(likelySignedIn()).toBe(true);
  });
});

describe("US-QS-32 the start frame carries a failed account load inside the frame (F-0059, Q03)", () => {
  it("US-QS-32 a body given to the start frame replaces the page skeleton in main, and both bars stay", () => {
    const { container } = frameAt(
      "/today",
      <p role="alert">Dein Konto konnte gerade nicht geladen werden.</p>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Dein Konto konnte");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(container.querySelector("[data-start-bar]")).not.toBeNull();
    expect(topBarOf(container)).toBeDefined();
    expect(screen.getByRole("main").contains(screen.getByRole("alert"))).toBe(true);
  });

  it("US-QS-32 without a body the start frame shows its skeleton as before", () => {
    const end = beginAppStart();
    try {
      frameAt("/today");
      expect(screen.getAllByRole("status")).toHaveLength(1);
    } finally {
      end();
    }
  });
});

describe("US-QS-32 the start frame carries the title of the page where it is shown (issue 2230)", () => {
  it("US-QS-32 below md the title of Heute is the top bar's title, and the brand is gone", () => {
    const { container } = frameAt(PATHS.today);
    const bar = container.querySelector("[data-app-bar-slot]");
    expect(bar?.querySelector("h1")?.textContent).toBe("Heute");
    expect(container.textContent).not.toContain("PflanzenDéx");
    expect(container.querySelector("main h1")).toBeNull();
  });

  it("US-QS-32 from md the title is the h1 of the content, and the top bar holds no title", () => {
    setViewportWidth(1024);
    const { container } = frameAt(PATHS.today);
    expect(container.querySelector("main h1")?.textContent).toBe("Heute");
    expect(container.querySelector(".top-0 h1")).toBeNull();
  });

  it("US-QS-32 the root shows the title and the body of Heute, the page it redirects to", () => {
    const { container, end } = startingAt("/");
    try {
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Heute");
      expect(screen.getByRole("status").textContent).toContain("Heute wird geladen …");
    } finally {
      end();
    }
  });

  it("US-QS-32 the Betreiber page shows its name in the top bar and its own loading status", () => {
    const { container, end } = startingAt(PATHS.operator);
    try {
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Betreiber");
      expect(screen.getByRole("status").textContent).toContain("Zahlen werden geladen …");
    } finally {
      end();
    }
  });

  it("US-QS-32 an address without a page title of its own keeps the brand in the top bar", () => {
    const { container } = frameAt(PATHS.account);
    expect(container.querySelector("[data-app-bar-slot]")).toBeNull();
    expect(container.textContent).toContain("PflanzenDéx");
  });
});

describe("US-QS-32 the start frame and the shell draw the bars alike (issue 2230)", () => {
  it("US-QS-32 the top bar has the class string of the shell's top bar", () => {
    const { container: start } = frameAt(PATHS.today);
    const shell = render(
      <MemoryRouter>
        <GlobalHeader />
      </MemoryRouter>,
    );
    expect(topBarOf(start)?.className).toBe(topBar);
    expect(shell.container.querySelector("header")?.className).toBe(topBar);
  });

  it("US-QS-32 the bottom bar and its words have the class strings of the shell's bottom bar", () => {
    const { container: start } = frameAt(PATHS.today);
    const shell = render(
      <MemoryRouter>
        <MobileNavBar items={navItems({})} />
      </MemoryRouter>,
    );
    const startBar = start.querySelector<HTMLElement>("[data-start-bar]");
    expect(startBar?.className).toBe(bottomBar);
    expect(shell.container.querySelector("nav[data-bottom-bar]")?.className).toBe(bottomBar);
    const realWords = shell.container.querySelector("nav[data-bottom-bar] a > span:last-child");
    expect(realWords?.className).toContain(barWords);
    expect(startBar?.querySelector("span > span:last-child")?.className).toContain(barWords);
  });

  it("US-QS-32 the start bar's slots are size containers and its words size by their longest word, as the shell's do (SG-NAV-07, issue 2245)", () => {
    const stored = ["Heute", "Sammlung", "Entdecken"].map((label) => ({ label, show: "always" }));
    window.localStorage.setItem(BAR_LABELS_KEY, JSON.stringify(stored));
    const { container } = frameAt(PATHS.today);
    const slots = Array.from(container.querySelectorAll<HTMLElement>("[data-start-bar] > span"));
    const tokens = barSlot.split(" ");
    expect(slots.map((s) => tokens.every((t) => s.className.split(" ").includes(t)))).toEqual([
      true,
      true,
      true,
    ]);
    const words = slots.map((s) => s.querySelector<HTMLElement>("span:last-child"));
    expect(words.map((w) => w?.style.getPropertyValue("--bar-word"))).toEqual(["5", "8", "9"]);
  });

  it("US-QS-32 the start frame draws the slots the shell stored on this device, hidden ones included (issue 2249)", () => {
    const stored = [
      { label: "Heute", show: "always" },
      { label: "Sammlung", show: "always" },
      { label: "Entdecken", show: "normal" },
      { label: "Freunde", show: "always" },
      { label: "Konto", show: "always" },
      { label: "Mehr", show: "large" },
    ];
    window.localStorage.setItem(BAR_LABELS_KEY, JSON.stringify(stored));
    const { container } = frameAt(PATHS.today);
    const labels = Array.from(
      container.querySelectorAll("[data-start-bar] > span > span:last-child"),
      (s) => s.textContent,
    );
    expect(labels).toEqual(stored.map((s) => s.label));
  });

  it("US-QS-32 (issue 2249) the start bar's slots carry the show classes and labels of the real bar, for stored and default slots", () => {
    const shown = (root: Element, selector: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector), (slot) => [
        slot.textContent,
        classesOf(slot).filter((c) => c.startsWith("@")),
      ]);
    const realBar = (items: ReturnType<typeof navItems>) =>
      shown(
        render(
          <MemoryRouter>
            <MobileNavBar items={items} />
          </MemoryRouter>,
        ).container,
        "nav[data-bottom-bar] > *",
      );
    const overflow = navItems({ operator: true, reviewer: true });
    const forStored = (items: ReturnType<typeof navItems>) =>
      barSlotsOf(items).map(({ label, show }) => ({ label, show }));

    // Defaults: no stored copy; the plain keeper's bar.
    const plain = frameAt(PATHS.today);
    expect(shown(plain.container, "[data-start-bar] > span")).toEqual(realBar(navItems({})));
    cleanup();

    // Stored: the overflow keeper's slots, as the shell stores them.
    window.localStorage.setItem(BAR_LABELS_KEY, JSON.stringify(forStored(overflow)));
    const stored = frameAt(PATHS.today);
    expect(shown(stored.container, "[data-start-bar] > span")).toEqual(realBar(overflow));
  });
});

describe("US-QS-32 the shell's start skeleton hands the title over to the route's skeleton (issue 2230)", () => {
  /** The shell's bar and main in miniature: the bar element a title claims, then the content (AppShell lays them out so). */
  function ShellBar() {
    const bar = useAppBarSlot();
    return (
      <header>
        {bar?.claimed ? null : <span>PflanzenDéx</span>}
        <div data-app-bar-slot="" ref={bar?.setElement} />
      </header>
    );
  }
  const shellAt = (path: string, content: ReactNode) => (
    <MemoryRouter initialEntries={[path]}>
      <AppBarSlotProvider>
        <ShellBar />
        <main>{content}</main>
      </AppBarSlotProvider>
    </MemoryRouter>
  );
  const shell = (content: ReactNode) => shellAt(PATHS.today, content);

  it("US-QS-32 below md the start's title is in the bar, not the content, and no brand shows in its place", () => {
    const { container } = render(shell(<StartPageSkeleton />));
    expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Heute");
    expect(container.querySelector("main h1")).toBeNull();
    expect(container.textContent).not.toContain("PflanzenDéx");
  });

  it("US-QS-32 the route's skeleton takes the title over without a second title or a move of the row", () => {
    const { container, rerender } = render(shell(<StartPageSkeleton />));
    const rowBefore = container.querySelector("[data-app-bar-slot] [data-page-header]")?.className;
    rerender(shell(<TodaySkeleton />));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Heute");
    expect(container.querySelector("[data-app-bar-slot] [data-page-header]")?.className).toBe(
      rowBefore,
    );
    expect(container.querySelector("main h1")).toBeNull();
  });
});

/**
 * The loading picture of a region as its shape: each status and each block by its classes (the text is checked apart). The
 * page header is not part of the body, so its blocks are left out.
 */
const shapeOf = (root: Element) =>
  Array.from(root.querySelectorAll("[role='status'], .animate-pulse"))
    .filter((el) => el.closest("[data-page-header]") === null)
    .map((el) => el.className);

/** Every function on, as before the shell loads (no feature state): the route's fallback reads the same switches. */
const fallbackState = { suggestionsOn: true, offered: () => true };

describe("US-QS-32 the start frame draws the body of Freunde and Entdecken as their routes do (issue 2243)", () => {
  it("US-QS-32 · issue 2243 /friends: the start frame draws the body of the route's skeleton of Freunde, its title in the bar below md", () => {
    const { container, end } = startingAt(PATHS.friends);
    try {
      const main = container.querySelector("main") as HTMLElement;
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Freunde");
      expect(container.querySelector("main h1")).toBeNull();
      expect(within(main).getByRole("status").textContent).toContain("Freunde werden geladen …");
      const route = render(<>{routeFallbackOf(PATHS.friends, "", fallbackState)}</>);
      expect(shapeOf(main)).toEqual(shapeOf(route.container));
    } finally {
      end();
    }
  });

  it("US-QS-32 · issue 2243 /discover: the start frame draws the body of Entdecken in the mode the address names, its title in the bar", () => {
    const { container, end } = startingAt(`${PATHS.discover}?view=catalog`);
    try {
      const main = container.querySelector("main") as HTMLElement;
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Entdecken");
      expect(within(main).getByRole("status").textContent).toContain("Katalog wird geladen …");
      const route = render(<>{routeFallbackOf(PATHS.discover, "?view=catalog", fallbackState)}</>);
      expect(shapeOf(main)).toEqual(shapeOf(route.container));
    } finally {
      end();
    }
  });

  it("US-QS-32 · issue 2243 /discover without an address shows the suggestions, and the mode remembered on this device when there is one", () => {
    const first = startingAt(PATHS.discover);
    try {
      expect(screen.getByRole("status").textContent).toContain("Vorschläge werden geladen …");
    } finally {
      first.end();
      cleanup();
    }
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "catalog");
    const second = startingAt(PATHS.discover);
    try {
      expect(screen.getByRole("status").textContent).toContain("Katalog wird geladen …");
    } finally {
      second.end();
    }
  });

  it("US-QS-32 · issue 2243 the body of Freunde and of Entdecken holds one loading status at the start, as the route's skeleton does (DS-56)", () => {
    for (const path of [PATHS.friends, PATHS.discover]) {
      const { container, end } = startingAt(path);
      try {
        expect(container.querySelectorAll("[role='status']"), path).toHaveLength(1);
      } finally {
        end();
        cleanup();
      }
    }
  });
});

describe("US-QS-32 the start hands the body of Freunde and Entdecken over to the route's skeleton (issue 2243)", () => {
  function ShellBar() {
    const bar = useAppBarSlot();
    return (
      <header>
        {bar?.claimed ? null : <span>PflanzenDéx</span>}
        <div data-app-bar-slot="" ref={bar?.setElement} />
      </header>
    );
  }
  const shellAt = (path: string, content: ReactNode) => (
    <MemoryRouter initialEntries={[path]}>
      <AppBarSlotProvider>
        <ShellBar />
        <main>{content}</main>
      </AppBarSlotProvider>
    </MemoryRouter>
  );

  it("US-QS-32 · issue 2243 from the start of /friends to its route's skeleton: the same body, one h1, the title stays in the bar", () => {
    const end = beginAppStart();
    try {
      const { container, rerender } = render(shellAt(PATHS.friends, <StartPageSkeleton />));
      const before = shapeOf(container.querySelector("main") as HTMLElement);
      rerender(shellAt(PATHS.friends, <FriendsRouteSkeleton />));
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Freunde");
      expect(shapeOf(container.querySelector("main") as HTMLElement)).toEqual(before);
    } finally {
      end();
    }
  });

  it("US-QS-32 · issue 2243 from the start of /discover to its route's skeleton: the same body, one h1, the title stays in the bar", () => {
    const end = beginAppStart();
    try {
      const { container, rerender } = render(shellAt(PATHS.discover, <StartPageSkeleton />));
      const before = shapeOf(container.querySelector("main") as HTMLElement);
      rerender(shellAt(PATHS.discover, <DiscoverRouteSkeleton view="suggestions" />));
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(container.querySelector("[data-app-bar-slot] h1")?.textContent).toBe("Entdecken");
      expect(shapeOf(container.querySelector("main") as HTMLElement)).toEqual(before);
    } finally {
      end();
    }
  });
});

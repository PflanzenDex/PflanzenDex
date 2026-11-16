// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { likelySignedIn } from "@/account";
import { navItems, PATHS } from "@/shared/patterns/navigation/navigation/navigation";
import { barSlot, barWords, bottomBar, topBar } from "@/shared/patterns/navigation/nav-item";
import { GlobalHeader } from "../../global-header/global-header";
import { MobileNavBar } from "../../mobile-nav-bar/mobile-nav-bar";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { beginAppStart } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
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

/** Renders the frame at the start of the app (the skeleton shows at once, SG-STATE-02) and ends the start after the test. */
function startingAt(path: string) {
  const end = beginAppStart();
  const view = frameAt(path);
  return { ...view, end };
}

function frameAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StartFrame />
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
      expect(bar?.children).toHaveLength(5);
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
    window.localStorage.setItem(BAR_LABELS_KEY, JSON.stringify(["Heute", "Sammlung", "Entdecken"]));
    const { container } = frameAt(PATHS.today);
    const slots = Array.from(container.querySelectorAll<HTMLElement>("[data-start-bar] > span"));
    expect(slots.map((s) => s.className.split(" ").includes(barSlot))).toEqual([true, true, true]);
    const words = slots.map((s) => s.querySelector<HTMLElement>("span:last-child"));
    expect(words.map((w) => w?.style.getPropertyValue("--bar-word"))).toEqual(["5", "8", "9"]);
  });

  it("US-QS-32 the start frame draws the labels the shell stored on this device", () => {
    const stored = ["Heute", "Sammlung", "Entdecken", "Freunde", "Mehr"];
    window.localStorage.setItem(BAR_LABELS_KEY, JSON.stringify(stored));
    const { container } = frameAt(PATHS.today);
    const labels = Array.from(
      container.querySelectorAll("[data-start-bar] > span > span:last-child"),
      (s) => s.textContent,
    );
    expect(labels).toEqual(stored);
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
  const shell = (content: ReactNode) => (
    <MemoryRouter initialEntries={[PATHS.today]}>
      <AppBarSlotProvider>
        <ShellBar />
        <main>{content}</main>
      </AppBarSlotProvider>
    </MemoryRouter>
  );

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

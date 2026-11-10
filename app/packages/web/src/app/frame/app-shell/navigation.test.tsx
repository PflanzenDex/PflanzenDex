// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import {
  BRAND_HREF,
  BRAND_LINK_LABEL,
  DISPLAY_NAME,
} from "../../../shared/patterns/navigation/nav-item";
import {
  CATALOG_ADDRESS,
  DIFFICULTY_ADDRESS,
  MANAGE_ADDRESS,
  PHASES_ADDRESS,
  WISHLIST_MODE_ADDRESS,
  accountAddress,
  destinationHeading,
  navItems,
  pageTitle,
  PATHS,
  profileAddress,
  todayAddress,
  viewAddress,
  viewTitle,
} from "../../../shared/patterns/navigation/navigation/navigation";

afterEach(cleanup);

const labels = (who: { reviewer?: boolean; operator?: boolean }) =>
  navItems(who).map((i) => i.label);

/** The shell renders the destinations twice (header row and bottom bar); the header row is the full list. */
const headerLinks = (path: string, who: { reviewer?: boolean; operator?: boolean }) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell items={navItems(who)}>
        <p>Inhalt</p>
      </AppShell>
    </MemoryRouter>,
  );
  return within(screen.getByRole("navigation", { name: "Hauptnavigation" }));
};

describe("US-QS-07 · the offline bar", () => {
  afterEach(() => {
    delete (navigator as { onLine?: boolean }).onLine;
  });

  it("US-QS-30 · the offline bar is an overlay outside the page and the state is announced (issue 1644, F8)", () => {
    const shell = () => (
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({})}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>
    );
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const online = render(shell());
    const mainOnline = document.querySelector("main")?.className;
    online.unmount();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(shell());
    const main = document.querySelector("main");
    const title = screen.getByText("Du bist offline");
    // The bar lies over the page: it is outside `main`, fixed, and takes no pointer input.
    expect(main?.contains(title)).toBe(false);
    const overlay = title.closest<HTMLElement>(".fixed");
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain("pointer-events-none");
    // `main` keeps its classes, so no padding or margin comes with the bar (DS-54).
    expect(main?.className).toBe(mainOnline);
    expect(document.querySelector('.sr-only[aria-live="polite"]')?.textContent).toContain(
      "Du bist offline.",
    );
  });
});

describe("US-BES-10 navigation", () => {
  it("US-BES-10 the review list tab is shown to operators and reviewers only", () => {
    expect(labels({})).not.toContain("Prüfliste");
    expect(labels({ reviewer: false })).not.toContain("Prüfliste");
    expect(labels({ reviewer: true })).toContain("Prüfliste");
    const nav = headerLinks("/review", { reviewer: true });
    expect(nav.getByRole("link", { name: "Prüfliste" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("US-DEV-06 navigation", () => {
  it("US-ONB-05 a locked destination keeps its place, order and name and carries a text mark", () => {
    const plain = navItems({});
    const marked = navItems({ locks: { friends: "Noch gesperrt" } });
    expect(marked.map((i) => i.label)).toEqual(plain.map((i) => i.label));
    expect(marked.find((i) => i.label === "Freunde")?.note).toBe("Noch gesperrt");
    expect(marked.filter((i) => i.note)).toHaveLength(1);
    render(
      <MemoryRouter>
        <AppShell items={marked}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const link = within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole(
      "link",
      { name: /Freunde/ },
    );
    expect(link.textContent).toContain("Noch gesperrt");
  });

  it("US-QS-14 Prüfliste and Betreiber belong to the group Verwaltung, no other destination has a group (issue 1093)", () => {
    const items = navItems({ reviewer: true, operator: true });
    expect(items.filter((i) => i.group).map((i) => [i.label, i.group])).toEqual([
      ["Prüfliste", "Verwaltung"],
      ["Betreiber", "Verwaltung"],
    ]);
  });

  it("US-ONB-05 / FR-ONB-06 without locks (style many) the navigation is exactly as before", () => {
    expect(navItems({ locks: {} })).toEqual(navItems({}));
    expect(navItems({}).some((i) => i.note)).toBe(false);
  });

  it("US-DEV-06 Freunde is hidden only while the function group social is off", () => {
    expect(labels({})).toContain("Freunde");
    expect(labels({ social: true } as never)).toContain("Freunde");
    expect(labels({ social: false } as never)).not.toContain("Freunde");
    expect(labels({ social: false } as never)).toContain("Konto");
  });
});

describe("US-ACC-05 navigation", () => {
  it("US-ACC-05 the operator tab is shown to the operator only, not to reviewers", () => {
    expect(labels({ reviewer: true })).not.toContain("Betreiber");
    expect(labels({ operator: true })).toContain("Betreiber");
    const nav = headerLinks("/operator", { operator: true });
    expect(nav.getByRole("link", { name: "Betreiber" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("US-QS-07 · DS-25 navigation items", () => {
  it("US-QS-07 · DS-25 every destination links to the address of its view", () => {
    const items = navItems({ reviewer: true, operator: true });
    expect(items.map((i) => i.href).sort()).toEqual(Object.values(PATHS).sort());
  });

  it("US-QS-07 · DS-25 the bottom bar shows at most 5 destinations, the rest sit in the drawer", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({ reviewer: true })}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const bar = within(screen.getByRole("navigation", { name: "Navigation unten" }));
    expect(bar.getAllByRole("link").length + bar.getAllByRole("button").length).toBeLessThanOrEqual(
      5,
    );
    expect(bar.getByRole("button", { name: "Mehr" })).toBeTruthy();
  });
});

describe("US-QS-16 · the brand leads to Heute", () => {
  it("US-QS-16 · the brand link leads to Heute, and on a destination only that one is marked active", () => {
    render(
      <MemoryRouter initialEntries={["/collection"]}>
        <AppShell items={navItems({ reviewer: true, operator: true })}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    for (const name of ["Navigation unten", "Navigation seitlich", "Hauptnavigation"]) {
      const nav = within(screen.getByRole("navigation", { name }));
      for (const link of nav.getAllByRole("link"))
        expect(link.getAttribute("aria-current") === "page", link.textContent ?? "").toBe(
          link.textContent === "Sammlung",
        );
    }
    const brand = within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole(
      "link",
      { name: "PflanzenDéx, zu Heute" },
    );
    expect(brand.getAttribute("href")).toBe("/today");
  });
});

describe("US-QS-07 · DS-22 navigation icons", () => {
  it("US-QS-07 · DS-22 every destination has a decorative icon", () => {
    const items = navItems({ reviewer: true, operator: true });
    expect(items.length).toBe(Object.values(PATHS).length);
    for (const item of items) expect(item.icon, item.label).not.toBeNull();
  });

  it("US-QS-07 · DS-22 the bottom bar slots show an aria-hidden icon and keep the label as the name", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({ reviewer: true })}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const bar = within(screen.getByRole("navigation", { name: "Navigation unten" }));
    const slots = [...bar.getAllByRole("link"), bar.getByRole("button", { name: "Mehr" })];
    for (const el of slots) {
      const svg = el.querySelector("svg");
      expect(svg, el.textContent ?? "").not.toBeNull();
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(bar.getByRole("link", { name: "Heute" })).toBeTruthy();
  });

  it("US-QS-14 · DS-25 the bar holds Heute, Sammlung, Entdecken, Freunde, then Mehr with Konto first; Start is no destination", () => {
    const items = navItems({});
    expect(items.slice(0, 5).map((i) => i.label)).toEqual([
      "Heute",
      "Sammlung",
      "Entdecken",
      "Freunde",
      "Konto",
    ]);
    expect(items.map((i) => i.label)).not.toContain("Pokédex");
    expect(items.map((i) => i.label)).not.toContain("Bestand");
    expect(items.map((i) => i.label)).not.toContain("Start");
    expect(items.map((i) => i.href)).not.toContain("/");
    expect(
      navItems({ reviewer: true, operator: true })
        .map((i) => i.label)
        .slice(-2),
    ).toEqual(["Prüfliste", "Betreiber"]);
  });
});

describe("US-QS-14 Wunschliste and Artenvergleich are modes of the Sammlung", () => {
  it("US-QS-14 · US-WUN-01 · US-BES-05 the navigation lists neither of them and has no path for them", () => {
    const labels = navItems({ reviewer: true, operator: true }).map((i) => i.label);
    expect(labels).not.toContain("Wunschliste");
    expect(labels).not.toContain("Artenvergleich");
    expect(Object.values(PATHS)).not.toContain("/wishlist");
    expect(Object.values(PATHS)).not.toContain("/difficulty");
  });

  it("US-QS-14 the addresses of the two modes are on the Sammlung", () => {
    expect(WISHLIST_MODE_ADDRESS).toBe("/collection?view=wishlist");
    expect(DIFFICULTY_ADDRESS).toBe("/collection?view=species&sort=difficulty");
    expect(viewTitle("/wishlist")).toBe("PflanzenDéx");
  });
});

describe("US-QS-14 Behandlung and Hinweise are sections of Heute", () => {
  it("US-QS-14 the navigation lists neither Behandlung nor Hinweise", () => {
    const labels = navItems({ reviewer: true, operator: true }).map((i) => i.label);
    expect(labels).not.toContain("Behandlung");
    expect(labels).not.toContain("Hinweise");
    expect(Object.values(PATHS)).not.toContain("/treatments");
    expect(Object.values(PATHS)).not.toContain("/hints");
  });

  it("US-QS-14 · US-QS-18 the topics have layer addresses on Heute, and Heute keeps its title", () => {
    expect(todayAddress("treatments")).toBe("/today?sheet=treatments");
    expect(todayAddress("hints")).toBe("/today?sheet=hints");
    expect(viewTitle("/today")).toBe("Heute – PflanzenDéx");
    expect(viewTitle("/unlock/equipment")).toBe("Funktion freischalten – PflanzenDéx");
  });
});

describe("US-QS-14 · issue 1097 the heading of a destination while it loads", () => {
  it("US-QS-14 · issue 1097 four destinations are named by their entry; Konto and any other address get none", () => {
    expect(["/today", "/collection", "/discover", "/friends"].map(destinationHeading)).toEqual([
      "Heute",
      "Sammlung",
      "Entdecken",
      "Freunde",
    ]);
    for (const other of [
      "/account",
      "/account/settings",
      "/discover/species/x",
      "/friends/abc",
      "/review",
      "/operator",
      "/unlock/equipment",
    ])
      expect(destinationHeading(other)).toBeNull();
  });
});

describe("US-QS-14 the destination Sammlung", () => {
  it("US-QS-14 the page title is the same for the plants and the species mode", () => {
    expect(viewTitle(PATHS.collection)).toBe("Sammlung – PflanzenDéx");
    expect(navItems({}).find((i) => i.href === "/collection")?.label).toBe("Sammlung");
  });
});

describe("display name (US-QS-14)", () => {
  it("US-QS-14: the product is displayed as PflanzenDéx and titles end with it", () => {
    expect(DISPLAY_NAME).toBe("PflanzenDéx");
    expect(BRAND_LINK_LABEL).toBe("PflanzenDéx, zu Heute");
    expect(BRAND_HREF).toBe(PATHS.today);
    expect(pageTitle("X")).toBe("X – PflanzenDéx");
    expect(pageTitle()).toBe("PflanzenDéx");
  });
});

describe("US-QS-14 Konto and Einstellungen are one destination", () => {
  it("US-QS-14 · US-ACC-02 the navigation lists Konto but not Einstellungen, and no path /settings", () => {
    const labels = navItems({ reviewer: true, operator: true }).map((i) => i.label);
    expect(labels).toContain("Konto");
    expect(labels).not.toContain("Einstellungen");
    expect(Object.values(PATHS)).not.toContain("/settings");
    expect(accountAddress("settings")).toBe("/account/settings");
    expect(accountAddress("profile")).toBe("/account/profile");
    expect(viewTitle("/account")).toBe("Konto – PflanzenDéx");
  });
});

describe("US-QS-14 Pflegephasen, Pflegeprofil and Standorte und Licht moved into the Sammlung", () => {
  it("US-QS-14 the navigation lists none of the three and no path for them", () => {
    const names = labels({ reviewer: true, operator: true });
    for (const gone of ["Pflegephasen", "Pflegeprofil", "Standorte und Licht"])
      expect(names).not.toContain(gone);
    for (const path of ["/care-phases", "/care-profile", "/light"])
      expect(Object.values(PATHS)).not.toContain(path);
  });

  it("US-QS-14 links to the three open their place in the Sammlung; other views keep their path", () => {
    expect(viewAddress("carePhases")).toBe("/collection?view=plants&group=phase");
    expect(viewAddress("light")).toBe("/collection?view=plants&manage=locations");
    expect(viewAddress("careProfile")).toBe("/collection?view=species");
    expect(PHASES_ADDRESS).toBe(viewAddress("carePhases"));
    expect(MANAGE_ADDRESS).toBe(viewAddress("light"));
    expect(viewAddress("friends")).toBe("/friends");
  });
});

describe("US-QS-14 the catalog is a mode of Entdecken, not a destination", () => {
  it("US-QS-14 the navigation has no entry Arten and the old Arten address leads to the catalog mode", () => {
    expect(labels({ reviewer: true, operator: true })).not.toContain("Arten");
    expect(CATALOG_ADDRESS).toBe("/discover?view=catalog");
    expect(viewAddress("species")).toBe(CATALOG_ADDRESS);
  });

  it("US-QS-14 a species profile lives below Entdecken, which stays the current destination, and has its own title", () => {
    expect(profileAddress("a 1")).toBe("/discover/species/a%201");
    expect(viewTitle(profileAddress("a1"))).toBe(pageTitle("Artenprofil"));
    const nav = headerLinks(profileAddress("a1"), {});
    expect(nav.getByRole("link", { name: "Entdecken" }).getAttribute("aria-current")).toBe("page");
  });

  it("US-QS-14 five destinations fit the bottom bar without Mehr, Prüfliste and Betreiber open the drawer", () => {
    expect(navItems({}).length).toBe(5);
    expect(navItems({ reviewer: true }).length).toBe(6);
  });
});

describe("US-QS-11 · the desktop navigation shows the key of its destination", () => {
  it("US-QS-11 Heute and Sammlung show their key in the sidebar and tell it to assistive technology; the bottom bar shows none", () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppShell items={navItems({})} shortcutMode="plain">
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const sidebar = document.querySelector('[data-side-nav="sidebar"]') as HTMLElement;
    const heute = within(sidebar).getByRole("link", { name: "Heute" });
    expect(heute.getAttribute("aria-keyshortcuts")).toBe("h");
    expect(heute.querySelector("kbd")?.textContent).toBe("h");
    expect(heute.querySelector("kbd")?.getAttribute("aria-hidden")).toBe("true");
    const sammlung = within(sidebar).getByRole("link", { name: "Sammlung" });
    expect(sammlung.getAttribute("aria-keyshortcuts")).toBe("s");
    // The link name stays the destination: the key is hidden from the accessible name.
    expect(heute.textContent).toBe("Heute" + "h");
    const bottom = document.querySelector("nav[data-bottom-bar]") as HTMLElement;
    expect(bottom.querySelector("kbd")).toBeNull();
  });

  it("US-QS-11 with the shortcuts off the navigation shows no key and no keyboard hint", () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppShell items={navItems({})} shortcutMode="disabled">
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const sidebar = document.querySelector('[data-side-nav="sidebar"]') as HTMLElement;
    const heute = within(sidebar).getByRole("link", { name: "Heute" });
    expect(heute.getAttribute("aria-keyshortcuts")).toBeNull();
    expect(heute.querySelector("kbd")).toBeNull();
  });
});

describe("US-QS-14 the bars below and from 30 rem of window height", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("US-QS-14 the app bar and the bottom bar are in the flow by default and fixed or sticky only in the tall window", () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppShell items={navItems({})}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const header = document.querySelector("header") as HTMLElement;
    const bar = document.querySelector("nav[data-bottom-bar]") as HTMLElement;
    const main = screen.getByRole("main");
    // The base classes carry no position; the tall-window variant (from 30 rem of height) adds the sticky and fixed ones.
    expect(header.classList).toContain("tall-window:sticky");
    expect(header.classList).not.toContain("sticky");
    expect(bar.classList).toContain("tall-window:fixed");
    expect(bar.classList).not.toContain("fixed");
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("US-QS-14 the shell writes the measured heights as variables, and removes them when it unmounts", () => {
    // jsdom has no layout and no ResizeObserver: a 45 px app bar and a 75 px bottom bar are measured by hand.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const height = this.matches("nav[data-bottom-bar]") ? 75 : this.tagName === "HEADER" ? 45 : 0;
      return {
        x: 0,
        y: 0,
        width: 320,
        height,
        top: 0,
        left: 0,
        right: 320,
        bottom: height,
      } as DOMRect;
    });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppShell items={navItems({})}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    const html = document.documentElement.style;
    const main = screen.getByRole("main");
    // The ring room of 8 px is added to each bar; tokens.css applies these only in the tall window (from 30 rem).
    expect(html.getPropertyValue("--header-clearance")).toBe("53px");
    expect(html.getPropertyValue("--bar-clearance")).toBe("83px");
    expect(main.style.getPropertyValue("--bar-reserve")).toBe("75px");
    unmount();
    expect(html.getPropertyValue("--header-clearance")).toBe("");
    expect(html.getPropertyValue("--bar-clearance")).toBe("");
    expect(main.style.getPropertyValue("--bar-reserve")).toBe("");
  });
});

describe("US-BES-17 print of the shell", () => {
  it("US-BES-17 the shell root has no print:hidden, so printing another page keeps its content and margins", () => {
    render(
      <MemoryRouter initialEntries={["/today"]}>
        <AppShell items={navItems({})}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    // The skip link is the first child of the shell root (app-shell.tsx).
    const root = screen.getByRole("link", { name: "Zum Inhalt springen" }).parentElement;
    expect(root?.className).toContain("md:flex-row");
    expect(root?.className).not.toContain("print:hidden");
  });
});

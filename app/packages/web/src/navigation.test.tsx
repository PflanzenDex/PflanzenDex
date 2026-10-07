// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./components/shared/app-shell";
import { BRAND_LINK_LABEL, DISPLAY_NAME } from "./components/shared/nav-item";
import {
  DIFFICULTY_ADDRESS,
  WISHLIST_MODE_ADDRESS,
  accountAddress,
  navItems,
  pageTitle,
  PATHS,
  todayAddress,
  viewTitle,
} from "./navigation";

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

describe("US-BES-10 navigation", () => {
  it("US-BES-10 the review list tab is shown to operators and reviewers only", () => {
    expect(labels({})).not.toContain("Prüfliste");
    expect(labels({ reviewer: false })).not.toContain("Prüfliste");
    expect(labels({ reviewer: true })).toContain("Prüfliste");
    const nav = headerLinks("/review", { reviewer: true });
    expect(nav.getByRole("link", { name: "Prüfliste" }).getAttribute("aria-current")).toBe("page");
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
    expect(items.map((i) => i.href).sort()).toEqual(
      Object.values(PATHS)
        .filter((p) => p !== PATHS.start)
        .sort(),
    );
  });

  it("US-QS-07 · DS-25 the bottom bar shows at most 5 destinations, the rest sit in the drawer", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({})}>
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

describe("US-QS-14 · the start page is no destination", () => {
  it("US-QS-14 · on / the brand link leads home and no destination is marked active", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({ reviewer: true, operator: true })}>
          <p>Inhalt</p>
        </AppShell>
      </MemoryRouter>,
    );
    for (const name of ["Navigation unten", "Navigation seitlich", "Hauptnavigation"]) {
      const nav = within(screen.getByRole("navigation", { name }));
      for (const link of nav.getAllByRole("link"))
        expect(link.getAttribute("aria-current"), link.textContent ?? "").toBeNull();
    }
    const brand = within(screen.getByRole("navigation", { name: "Hauptnavigation" })).getByRole(
      "link",
      { name: "PflanzenDéx, zur Startseite" },
    );
    expect(brand.getAttribute("href")).toBe("/");
  });
});

describe("US-QS-07 · DS-22 navigation icons", () => {
  it("US-QS-07 · DS-22 every destination has a decorative icon", () => {
    const items = navItems({ reviewer: true, operator: true });
    expect(items.length).toBe(Object.values(PATHS).length - 1);
    for (const item of items) expect(item.icon, item.label).not.toBeNull();
  });

  it("US-QS-07 · DS-22 the bottom bar slots show an aria-hidden icon and keep the label as the name", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell items={navItems({})}>
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

  it("US-QS-14 the sections have addresses on Heute, and Heute keeps its title", () => {
    expect(todayAddress("treatments")).toBe("/today#behandlungen");
    expect(todayAddress("hints")).toBe("/today#fehlt-noch");
    expect(viewTitle("/today")).toBe("Heute – PflanzenDéx");
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
    expect(BRAND_LINK_LABEL).toBe("PflanzenDéx, zur Startseite");
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
    expect(accountAddress("settings")).toBe("/account#einstellungen");
    expect(accountAddress("profile")).toBe("/account#profil");
    expect(viewTitle("/account")).toBe("Konto – PflanzenDéx");
  });
});

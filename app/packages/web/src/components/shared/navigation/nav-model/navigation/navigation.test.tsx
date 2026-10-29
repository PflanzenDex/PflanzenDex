// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "../../app-shell/app-shell";
import { BRAND_LINK_LABEL, DISPLAY_NAME } from "../nav-item";
import {
  CATALOG_ADDRESS,
  DIFFICULTY_ADDRESS,
  MANAGE_ADDRESS,
  PHASES_ADDRESS,
  WISHLIST_MODE_ADDRESS,
  accountAddress,
  navItems,
  pageTitle,
  PATHS,
  profileAddress,
  todayAddress,
  viewAddress,
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
    expect(items.map((i) => i.href).sort()).toEqual(
      Object.values(PATHS)
        .filter((p) => p !== PATHS.start)
        .sort(),
    );
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

  it("US-QS-14 the sections have addresses on Heute, and Heute keeps its title", () => {
    expect(todayAddress("treatments")).toBe("/today#behandlungen");
    expect(todayAddress("hints")).toBe("/today#fehlt-noch");
    expect(viewTitle("/today")).toBe("Heute – PflanzenDéx");
    expect(viewTitle("/unlock/equipment")).toBe("Funktion freischalten – PflanzenDéx");
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

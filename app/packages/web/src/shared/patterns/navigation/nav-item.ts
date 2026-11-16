import type { ReactNode } from "react";

/** One navigation destination: data only, never a module or domain object (DS-44). */
export type NavItem = {
  href: string;
  /** German label shown next to or under the icon. */
  label: string;
  /** Decorative icon; the label carries the meaning (DS-17). */
  icon: ReactNode;
  /** Text mark of a destination that is not open yet ("Bald", "Noch gesperrt"); the label itself never changes (US-ONB-05, NFR-13). */
  note?: string;
  /** German name of the group the item belongs to; the labelled sidebar shows it as a heading above the group (issue 1093). */
  group?: string;
  /** The address a tap on this destination goes to while it is the current one (SG-NAV-03); `href` when not set. */
  start?: string;
  /** The mode a tap on the current destination remembers on this device, e.g. "plants" for "Sammlung" (SG-NAV-03). */
  remember?: { key: string; value: string };
};

/**
 * The per-device copy of the mode of "Sammlung" and "Entdecken" (DS-10; the address always wins). The keys live here, in a
 * leaf module (its only import is a type), so the view modules and the navigation read them without an import cycle.
 */
export const SAMMLUNG_VIEW_KEY = "pflanzendex.collection-view";
export const DISCOVER_VIEW_KEY = "pflanzendex.discover-view";

/**
 * What a tap on the current destination does besides going to its start (SG-NAV-03, US-QS-32): "Sammlung" opens its plants
 * and remembers them, "Entdecken" its suggestions. The addresses are those of `PATHS` in the navigation; the other
 * destinations start at their own address.
 */
export const START_MODES: Partial<Record<string, Pick<NavItem, "start" | "remember">>> = {
  collection: {
    start: "/collection?view=plants",
    remember: { key: SAMMLUNG_VIEW_KEY, value: "plants" },
  },
  discover: {
    start: "/discover?view=suggestions",
    remember: { key: DISCOVER_VIEW_KEY, value: "suggestions" },
  },
};

/** Same look for the bottom bar and the rail: a 56x30 px pill behind a 24 px icon, the label under it (ADR 0011 decision 6). */
export const stackedItem =
  "group flex min-h-[44px] shrink-0 min-w-[44px] flex-col items-center justify-center gap-1 px-0.5 py-1 text-center text-xs " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The pill is the selection: its accent fill and a 1 px boundary in primary, which reaches 3:1 against the card of the bar
 * in both schemes (SG-COLOR-06: 6.46:1 in light, 10.04:1 in dark). The label's weight (600 against 400) and `aria-current`
 * repeat it, so colour is never alone (DS-19, SG-COLOR-05). `w-14` is 3.5 rem, so it doubles with the text size;
 * `max-w-full` keeps it inside its slot of the bar at 200 % text (issue 1019: it stuck out of the bar at the right edge).
 * `relative` lets the lock mark sit on the icon's corner; `[&>svg]` sizes only the direct icon in px (SG-ICON-01, 24 px),
 * so the mark's own glyph keeps its size.
 */
export const stackedPill = (active: boolean) =>
  "relative flex h-[30px] w-14 max-w-full items-center justify-center rounded-full border [&>svg]:size-[24px] " +
  (active
    ? "border-primary bg-accent text-accent-foreground forced-colors:border-[color:Highlight]"
    : "border-transparent text-muted-foreground group-hover:bg-muted");

/** The selected label is semibold, the others regular (US-QS-32, F-0054); the colour follows the same choice. */
export const stackedLabel = (active: boolean) =>
  active ? "font-semibold text-foreground" : "font-normal text-muted-foreground";

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

/** How the product is shown to users (US-QS-14). Identifiers, repository and docs keep "PflanzenDex". */
export const DISPLAY_NAME = "PflanzenDéx";

/** The display name is not imported from core: the root barrel of core would add about 5 kB gzip to the initial bundle (DS-08). */
const PRODUCT = DISPLAY_NAME;
/** "Name – PflanzenDéx", or the product alone without a name (US-QS-09, WCAG 2.4.2). Lives here so the start does not load the navigation chunk (DS-08). */
export const pageTitle = (view?: string) => (view ? `${view} – ${PRODUCT}` : PRODUCT);

/** Where every brand link leads: "Heute", the home screen (US-QS-16); equals `PATHS.today`. */
export const BRAND_HREF = "/today";

/** Accessible name of every brand link; the brand leads to "Heute", the home screen (US-QS-16). */
export const BRAND_LINK_LABEL = `${DISPLAY_NAME}, zu Heute`;

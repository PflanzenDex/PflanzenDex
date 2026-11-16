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

/**
 * The destinations whose page heading is the name of their entry at every width (measured 2026-11-02, issue 1097); "Konto"
 * is not one: from 1024 px it opens "Einstellungen" with its own heading. The names equal the entries' labels in
 * navigation.tsx (a test keeps them equal). Lives here, not in navigation.tsx, so the start does not load the navigation
 * chunk (DS-08).
 */
const HEADINGS = new Map<string, string>([
  ["/today", "Heute"],
  ["/collection", "Sammlung"],
  ["/discover", "Entdecken"],
  ["/friends", "Freunde"],
]);

/** The heading of a destination while its page loads; `null` for any other address, whose page names itself. */
export const destinationHeading = (pathname: string): string | null =>
  HEADINGS.get(pathname) ?? null;

/** Where every brand link leads: "Heute", the home screen (US-QS-16); equals `PATHS.today`. */
export const BRAND_HREF = "/today";

/** Accessible name of every brand link; the brand leads to "Heute", the home screen (US-QS-16). */
export const BRAND_LINK_LABEL = `${DISPLAY_NAME}, zu Heute`;

/** The slots of the bottom bar (DS-25): at most five, or four destinations and "Mehr"; the start frame draws the same count. */
export const BAR_SLOTS = 5;

/** The button of the drawer at the end of the bottom bar, when destinations do not fit (DS-25). */
export const MORE_LABEL = "Mehr";

/** The labels of the bottom bar as it shows them: the destinations, or four and "Mehr" when they do not fit (DS-25). */
export function barLabelsOf(items: readonly NavItem[]): string[] {
  return items.length > BAR_SLOTS
    ? [...items.slice(0, BAR_SLOTS - 1).map((item) => item.label), MORE_LABEL]
    : items.map((item) => item.label);
}

/**
 * The classes of the shell's bars and of their rows (issue 2230): the top bar, the bottom bar, the row of a page's title in
 * the bar (`barRow`, `barTitle`) and in the content (`contentRow`), the brand and the words under the icons (`barWords`).
 * The shell and the start frame use these strings, so the start draws the bars at the height the page's bars have.
 */
export const topBar =
  "top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] tall-window:sticky md:hidden";
export const bottomBar =
  "inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] tall-window:fixed md:hidden";
export const brandLink =
  "flex min-h-[44px] items-center text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const barRow = "flex min-h-[44px] w-full min-w-0 flex-wrap items-center gap-2";
export const barTitle = "min-w-0 flex-1 break-words text-lg font-semibold";
export const contentRow = "flex min-w-0 flex-wrap items-center gap-2";
/** The words under an icon: a label wraps to at most two lines in its slot, and a long word breaks at a syllable (US-QS-32). */
export const barWords = "block max-w-full text-center hyphens-auto [overflow-wrap:anywhere]";

/** The defaults of the bottom bar for a keeper without a stored copy of its labels (`start-frame/bar-labels.ts`). */
export const DEFAULT_BAR_LABELS = ["Heute", "Sammlung", "Entdecken", "Freunde", "Konto"];

/** The Betreiber page: its name in the top bar and its address (equals `PATHS.operator`, as `BRAND_HREF` equals `PATHS.today`). */
export const OPERATOR_HEADING = "Betreiber";
export const OPERATOR_ADDRESS = "/operator";

/**
 * The title the start frame and the page's skeleton show in the top bar for an address, where its page has one (issue 2230):
 * "Heute" for the root too, which redirects there; `null` for every other address, which keeps the brand.
 */
export const startTitleOf = (pathname: string): string | null =>
  pathname === OPERATOR_ADDRESS
    ? OPERATOR_HEADING
    : destinationHeading(pathname === "/" ? BRAND_HREF : pathname);

/** The title of a page's row in the content (SG-HEAD-01): the minimum width of the title, without a way back or an action. */
export const contentTitle = "min-w-20 flex-1 [overflow-wrap:anywhere]";

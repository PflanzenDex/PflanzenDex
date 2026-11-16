import type { CSSProperties, ReactNode } from "react";

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

/** The slots of the bottom bar (DS-25): at most five, or four destinations and "Mehr"; the start frame draws the same count. */
export const BAR_SLOTS = 5;

/** The button of the drawer at the end of the bottom bar, when destinations do not fit (DS-25). */
export const MORE_LABEL = "Mehr";

/** When a slot of the bottom bar shows (SG-NAV-07, owner 2026-11-16, issue 2249): at both text sizes, the normal one or the large. */
export type BarShow = "always" | "normal" | "large";

/**
 * The classes that hide a slot at one text size. The bar is a size container (`bottomBar`, `@container/bar`) and measures its
 * text size by its content width in rem, which shrinks as the text grows. 20.5 rem (328 px of content at 100 % text, a bar
 * of 336 px) is where the five slots hold the longest label of the normal layout, the selected "Entdecken" (60 px at 12 px,
 * measured 2026-11-16), at 12 px; below it, at a larger text, "Entdecken" moves into "Mehr" (SG-NAV-07). Both layouts are one
 * slot list (`barSlotsOf` in `app/frame/mobile-nav-bar/bar-slots.ts`), and CSS shows the one that fits.
 */
export const BAR_SHOW_CLASS: Record<BarShow, string> = {
  always: "",
  normal: "@max-[20.5rem]/bar:hidden",
  large: "@min-[20.5rem]/bar:hidden",
};

/** One slot of the bottom bar: a destination, or "Mehr" with the destinations of its drawer (DS-25). */
export type BarSlot =
  | { label: string; show: BarShow; item: NavItem }
  | { label: string; show: BarShow; drawer: NavItem[] };

/** What the start frame keeps of a slot on this device: its words and when it shows (`start-frame/bar-labels.ts`). */
export type BarSlotLabel = { label: string; show: BarShow };

/**
 * The classes of the shell's bars and of their rows (issue 2230): the top bar, the bottom bar, the row of a page's title in
 * the bar (`barRow`, `barTitle`) and in the content (`contentRow`), the brand and the words under the icons (`barWords`).
 * The shell and the start frame use these strings, so the start draws the bars at the height the page's bars have.
 */
export const topBar =
  "top-0 z-40 flex items-center gap-4 border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] tall-window:sticky md:hidden";
/**
 * The spacings of the bottom bar are px, not rem: at 100 % text they are the same, and at a larger text they stay, so the five
 * slots keep their room for the labels (issue 2249). `@container/bar` names the container of the slot visibility (`BAR_SHOW_CLASS`).
 */
export const bottomBar =
  "inset-x-0 bottom-0 z-40 flex items-stretch gap-[2px] border-t border-border bg-card px-[4px] pb-[env(safe-area-inset-bottom)] @container/bar tall-window:fixed md:hidden";
export const brandLink =
  "flex min-h-[44px] items-center text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const barRow = "flex min-h-[44px] w-full min-w-0 flex-wrap items-center gap-2";
export const barTitle = "min-w-0 flex-1 break-words text-lg font-semibold";
export const contentRow = "flex min-w-0 flex-wrap items-center gap-2";
/**
 * The words under an icon (SG-NAV-07, issue 2245): whole words that wrap at spaces to at most two lines and never break
 * inside a word (`hyphens-manual` and the default break, no syllables). A word wider than its slot shrinks: the font size is
 * at most the text-xs size and at most the slot's width (`barSlot`, 100cqi) over the characters of the label's longest word
 * (`--bar-word`, `barWordsStyle`) times 0.61 em, the widest measured average glyph of the bar's labels in Figtree semibold
 * ("Sammlung", 0.601 em). A label that fits keeps its size. `overflow-hidden text-ellipsis` is the last safety net. The size
 * never goes below 12 px, the size at 100 % text (issue 2249): the bar's layouts leave room for it (`BAR_SHOW_CLASS`).
 */
export const barWords =
  "block max-w-full overflow-hidden text-center text-ellipsis hyphens-manual [font-size:max(12px,min(var(--text-xs),calc(100cqi/(var(--bar-word)*0.61))))]";
/**
 * The slots of the bottom bar and of the start frame's bar are size containers, so their words size by the slot (not the side
 * rail), and they keep 2 px of side room in px (issue 2249, `bottomBar`).
 */
export const barSlot = "[container-type:inline-size] px-[2px]";
/** The custom property `barWords` sizes a label by: the characters of the label's longest word. */
export const barWordsStyle = (label: string): CSSProperties =>
  ({
    "--bar-word": Math.max(1, ...label.split(/\s+/).map((word) => [...word].length)),
  }) as CSSProperties;

/**
 * The slots of the bottom bar of a keeper without a stored copy (`start-frame/bar-labels.ts`): the plain keeper's, at both text
 * sizes. A test keeps them equal to `barSlotsOf` (`app/frame/mobile-nav-bar/bar-slots.ts`) of the plain destinations.
 */
export const DEFAULT_BAR_SLOTS: BarSlotLabel[] = [
  { label: "Heute", show: "always" },
  { label: "Sammlung", show: "always" },
  { label: "Entdecken", show: "normal" },
  { label: "Freunde", show: "always" },
  { label: "Konto", show: "always" },
  { label: "Mehr", show: "large" },
];

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

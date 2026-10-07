import {
  Building2,
  CalendarCheck,
  CalendarClock,
  Compass,
  Users,
  Leaf,
  ListChecks,
  Package,
  Sun,
  User,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { DISPLAY_NAME, type NavItem } from "./components/shared/nav-item";

export type View =
  | "start"
  | "today"
  | "species"
  | "collection"
  | "carePhases"
  | "careProfile"
  | "discover"
  | "friends"
  | "light"
  | "review"
  | "operator"
  | "account";

const ENTRIES: { id: View; text: string; icon: LucideIcon }[] = [
  { id: "today", text: "Heute", icon: CalendarCheck },
  { id: "collection", text: "Sammlung", icon: Package },
  { id: "discover", text: "Entdecken", icon: Compass },
  { id: "friends", text: "Freunde", icon: Users },
  { id: "account", text: "Konto", icon: User },
  { id: "species", text: "Arten", icon: Leaf },
  { id: "light", text: "Standorte und Licht", icon: Sun },
  { id: "carePhases", text: "Pflegephasen", icon: CalendarClock },
  { id: "careProfile", text: "Pflegeprofil", icon: ListChecks },
  { id: "review", text: "Prüfliste", icon: ClipboardCheck },
  { id: "operator", text: "Betreiber", icon: Building2 },
];

/** One URL path per view (English); the link texts above stay German. */
export const PATHS: Record<View, string> = {
  start: "/",
  today: "/today",
  species: "/species",
  collection: "/collection",
  carePhases: "/care-phases",
  careProfile: "/care-profile",
  discover: "/discover",
  friends: "/friends",
  light: "/light",
  review: "/review",
  operator: "/operator",
  account: "/account",
};

/** The former addresses of "Wunschliste" and "Artenvergleich": the third mode and an arrangement of the species of the Sammlung (US-QS-14). */
export const LEGACY_WISHLIST_PATH = "/wishlist";
export const LEGACY_DIFFICULTY_PATH = "/difficulty";
/** Where the wishlist lives now, and where the "to the wishlist" actions lead (US-POK-09, US-WUN-01). */
export const WISHLIST_MODE_ADDRESS = `${PATHS.collection}?view=wishlist`;
/** The comparison of the species by difficulty (US-BES-05). */
export const DIFFICULTY_ADDRESS = `${PATHS.collection}?view=species&sort=difficulty`;

/** The former Pokédex address: it opens the species mode of the Sammlung, so old links keep working (US-QS-14). */
export const LEGACY_POKEDEX_PATH = "/pokedex";
/** Where the old Pokédex address leads: the destination "Sammlung" in its species mode. */
export const SPECIES_MODE_ADDRESS = `${PATHS.collection}?view=species`;

/** The former addresses of the destinations "Behandlung" and "Hinweise": they open the sections of "Heute" (US-QS-14). */
export const LEGACY_TREATMENTS_PATH = "/treatments";
export const LEGACY_HINTS_PATH = "/hints";
/** The sections of "Heute" below "Jetzt dran" by the anchor in the address, e.g. `/today#behandlungen` (US-QS-14). */
export const TODAY_SECTIONS = { treatments: "behandlungen", hints: "fehlt-noch" } as const;
export type TodaySection = keyof typeof TODAY_SECTIONS;
export const todayAddress = (section: TodaySection) => `${PATHS.today}#${TODAY_SECTIONS[section]}`;

/** The former address of the destination "Einstellungen": it opens the section "Einstellungen" of "Konto" (US-QS-14). */
export const LEGACY_SETTINGS_PATH = "/settings";
/** The sections of "Konto" by the anchor in the address, e.g. `/account#einstellungen` (US-QS-14). */
export const ACCOUNT_SECTIONS = { profile: "profil", settings: "einstellungen" } as const;
export type AccountSection = keyof typeof ACCOUNT_SECTIONS;
export const accountAddress = (section: AccountSection) =>
  `${PATHS.account}#${ACCOUNT_SECTIONS[section]}`;

const visible = (
  id: View,
  who: { reviewer?: boolean | undefined; operator?: boolean | undefined },
) => (id === "review" ? who.reviewer === true : id === "operator" ? who.operator === true : true);

/**
 * The destinations for the shared shell (US-QS-07, DS-25). The review list is only for operators and reviewers
 * (US-BES-10), the operator area only for the operator (US-ACC-05); everybody else never sees these entries.
 */
export function navItems(who: {
  reviewer?: boolean | undefined;
  operator?: boolean | undefined;
}): NavItem[] {
  return ENTRIES.filter((e) => visible(e.id, who)).map((e) => ({
    href: PATHS[e.id],
    label: e.text,
    icon: <e.icon aria-hidden="true" className="size-5 shrink-0" />,
  }));
}

/** The display name is not imported from core: the root barrel of core would add about 5 kB gzip to the initial bundle (DS-08). */
const PRODUCT = DISPLAY_NAME;
/** "Name – PflanzenDéx", or the product alone without a name (US-QS-09, WCAG 2.4.2). */
export const pageTitle = (view?: string) => (view ? `${view} – ${PRODUCT}` : PRODUCT);

/**
 * The page title of the address (US-QS-09, WCAG 2.4.2): the name of the navigation entry, so title, entry and heading
 * agree; a species profile has its own address below the catalog. Unknown addresses redirect, so they only get the product.
 */
export function viewTitle(pathname: string): string {
  // The start page is no destination (brand link, landing page) but keeps its page title.
  if (pathname === PATHS.start) return pageTitle("Start");
  const entry = ENTRIES.find((e) => PATHS[e.id] === pathname);
  if (entry) return pageTitle(entry.text);
  return pathname.startsWith(`${PATHS.species}/`) ? pageTitle("Artenprofil") : pageTitle();
}

import {
  Building2,
  CalendarCheck,
  CalendarClock,
  Compass,
  Gauge,
  Heart,
  Users,
  Leaf,
  Lightbulb,
  ListChecks,
  Package,
  Settings,
  Sprout,
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
  | "treatments"
  | "hints"
  | "carePhases"
  | "careProfile"
  | "difficulty"
  | "wishlist"
  | "discover"
  | "friends"
  | "light"
  | "review"
  | "operator"
  | "account"
  | "settings";

const ENTRIES: { id: View; text: string; icon: LucideIcon }[] = [
  { id: "today", text: "Heute", icon: CalendarCheck },
  { id: "collection", text: "Sammlung", icon: Package },
  { id: "discover", text: "Entdecken", icon: Compass },
  { id: "wishlist", text: "Wunschliste", icon: Heart },
  { id: "species", text: "Arten", icon: Leaf },
  { id: "friends", text: "Freunde", icon: Users },
  { id: "light", text: "Standorte und Licht", icon: Sun },
  { id: "treatments", text: "Behandlung", icon: Sprout },
  { id: "hints", text: "Hinweise", icon: Lightbulb },
  { id: "carePhases", text: "Pflegephasen", icon: CalendarClock },
  { id: "careProfile", text: "Pflegeprofil", icon: ListChecks },
  { id: "difficulty", text: "Artenvergleich", icon: Gauge },
  { id: "review", text: "Prüfliste", icon: ClipboardCheck },
  { id: "operator", text: "Betreiber", icon: Building2 },
  { id: "account", text: "Konto", icon: User },
  { id: "settings", text: "Einstellungen", icon: Settings },
];

/** One URL path per view (English); the link texts above stay German. */
export const PATHS: Record<View, string> = {
  start: "/",
  today: "/today",
  species: "/species",
  collection: "/collection",
  treatments: "/treatments",
  hints: "/hints",
  carePhases: "/care-phases",
  careProfile: "/care-profile",
  difficulty: "/difficulty",
  wishlist: "/wishlist",
  discover: "/discover",
  friends: "/friends",
  light: "/light",
  review: "/review",
  operator: "/operator",
  account: "/account",
  settings: "/settings",
};

/** The former Pokédex address: it opens the species mode of the Sammlung, so old links keep working (US-QS-14). */
export const LEGACY_POKEDEX_PATH = "/pokedex";
/** Where the old Pokédex address leads: the destination "Sammlung" in its species mode. */
export const SPECIES_MODE_ADDRESS = `${PATHS.collection}?view=species`;

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

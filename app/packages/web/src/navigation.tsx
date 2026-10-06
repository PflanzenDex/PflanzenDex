import {
  BookOpen,
  Building2,
  CalendarClock,
  Gauge,
  Heart,
  Home,
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
import type { NavItem } from "./components/shared/nav-item";

export type View =
  | "start"
  | "species"
  | "collection"
  | "treatments"
  | "hints"
  | "carePhases"
  | "careProfile"
  | "difficulty"
  | "pokedex"
  | "wishlist"
  | "light"
  | "review"
  | "operator"
  | "account"
  | "settings";

const ENTRIES: { id: View; text: string; icon: LucideIcon }[] = [
  { id: "start", text: "Start", icon: Home },
  { id: "species", text: "Arten", icon: Leaf },
  { id: "collection", text: "Bestand", icon: Package },
  { id: "treatments", text: "Behandlung", icon: Sprout },
  { id: "hints", text: "Hinweise", icon: Lightbulb },
  { id: "carePhases", text: "Pflegephasen", icon: CalendarClock },
  { id: "careProfile", text: "Pflegeprofil", icon: ListChecks },
  { id: "difficulty", text: "Artenvergleich", icon: Gauge },
  { id: "pokedex", text: "Pokédex", icon: BookOpen },
  { id: "wishlist", text: "Wunschliste", icon: Heart },
  { id: "light", text: "Standorte und Licht", icon: Sun },
  { id: "review", text: "Prüfliste", icon: ClipboardCheck },
  { id: "operator", text: "Betreiber", icon: Building2 },
  { id: "account", text: "Konto", icon: User },
  { id: "settings", text: "Einstellungen", icon: Settings },
];

/** One URL path per view (English); the link texts above stay German. */
export const PATHS: Record<View, string> = {
  start: "/",
  species: "/species",
  collection: "/collection",
  treatments: "/treatments",
  hints: "/hints",
  carePhases: "/care-phases",
  careProfile: "/care-profile",
  difficulty: "/difficulty",
  pokedex: "/pokedex",
  wishlist: "/wishlist",
  light: "/light",
  review: "/review",
  operator: "/operator",
  account: "/account",
  settings: "/settings",
};

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

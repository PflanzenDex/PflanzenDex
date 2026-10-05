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

const ENTRIES: { id: View; text: string }[] = [
  { id: "start", text: "Start" },
  { id: "species", text: "Arten" },
  { id: "collection", text: "Bestand" },
  { id: "treatments", text: "Behandlung" },
  { id: "hints", text: "Hinweise" },
  { id: "carePhases", text: "Pflegephasen" },
  { id: "careProfile", text: "Pflegeprofil" },
  { id: "difficulty", text: "Artenvergleich" },
  { id: "pokedex", text: "Pokédex" },
  { id: "wishlist", text: "Wunschliste" },
  { id: "light", text: "Standorte und Licht" },
  { id: "review", text: "Prüfliste" },
  { id: "operator", text: "Betreiber" },
  { id: "account", text: "Konto" },
  { id: "settings", text: "Einstellungen" },
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
    icon: null,
  }));
}

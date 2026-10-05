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

/** The view an address belongs to (a species profile /species/:id belongs to the catalog); unknown addresses give null. */
export function viewOfPath(pathname: string): View | null {
  const first = "/" + (pathname.split("/")[1] ?? "");
  return (Object.keys(PATHS) as View[]).find((v) => PATHS[v] === first) ?? null;
}

const visible = (
  id: View,
  who: { reviewer?: boolean | undefined; operator?: boolean | undefined },
) => (id === "review" ? who.reviewer === true : id === "operator" ? who.operator === true : true);

/**
 * The review list is only for operators and reviewers (US-BES-10), the operator area only for the operator
 * (US-ACC-05); everybody else never sees these tabs.
 */
export function Navigation(props: {
  active: View;
  onSwitch: (a: View) => void;
  reviewer?: boolean;
  operator?: boolean;
}) {
  return (
    <nav aria-label="Hauptnavigation" className="navigation">
      {ENTRIES.filter((e) => visible(e.id, props)).map((e) => (
        <button
          key={e.id}
          type="button"
          className={e.id === props.active ? "tab active" : "tab"}
          aria-current={e.id === props.active ? "page" : undefined}
          onClick={() => props.onSwitch(e.id)}
        >
          {e.text}
        </button>
      ))}
    </nav>
  );
}

export type View =
  | "species"
  | "collection"
  | "treatments"
  | "hints"
  | "carePhases"
  | "careProfile"
  | "pokedex"
  | "light"
  | "review"
  | "account"
  | "settings";

const ENTRIES: { id: View; text: string }[] = [
  { id: "species", text: "Arten" },
  { id: "collection", text: "Bestand" },
  { id: "treatments", text: "Behandlung" },
  { id: "hints", text: "Hinweise" },
  { id: "carePhases", text: "Pflegephasen" },
  { id: "careProfile", text: "Pflegeprofil" },
  { id: "pokedex", text: "Pokédex" },
  { id: "light", text: "Standorte und Licht" },
  { id: "review", text: "Prüfliste" },
  { id: "account", text: "Konto" },
  { id: "settings", text: "Einstellungen" },
];

/** The review list is only for operators and reviewers (US-BES-10); everybody else never sees the tab. */
export function Navigation(props: {
  active: View;
  onSwitch: (a: View) => void;
  reviewer?: boolean;
}) {
  return (
    <nav aria-label="Hauptnavigation" className="navigation">
      {ENTRIES.filter((e) => e.id !== "review" || props.reviewer).map((e) => (
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

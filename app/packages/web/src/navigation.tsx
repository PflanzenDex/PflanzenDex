export type Ansicht = "arten" | "bestand" | "pflegephasen" | "licht" | "konto";

const EINTRAEGE: { id: Ansicht; text: string }[] = [
  { id: "arten", text: "Arten" },
  { id: "bestand", text: "Bestand" },
  { id: "pflegephasen", text: "Pflegephasen" },
  { id: "licht", text: "Standorte und Licht" },
  { id: "konto", text: "Konto" },
];

export function Navigation(props: { aktiv: Ansicht; onWechsel: (a: Ansicht) => void }) {
  return (
    <nav aria-label="Hauptnavigation" className="navigation">
      {EINTRAEGE.map((e) => (
        <button
          key={e.id}
          type="button"
          className={e.id === props.aktiv ? "tab aktiv" : "tab"}
          aria-current={e.id === props.aktiv ? "page" : undefined}
          onClick={() => props.onWechsel(e.id)}
        >
          {e.text}
        </button>
      ))}
    </nav>
  );
}

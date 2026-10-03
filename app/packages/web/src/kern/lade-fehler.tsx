import type { ApiFehler } from "./api";

/** Ladefehler einer Seite: der Text zum Fehlercode und die Handlung „Erneut laden“ (P-09, P-10). */
export function LadeFehler(props: { fehler: ApiFehler; onNeuLaden: () => void }) {
  return (
    <div role="alert" className="warnung">
      <p>{props.fehler.text}</p>
      <div className="aktionen">
        <button type="button" className="sekundaer" onClick={props.onNeuLaden}>
          Erneut laden
        </button>
      </div>
    </div>
  );
}

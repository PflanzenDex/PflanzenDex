const TEXTE: [name: string, beschriftung: string, hilfe?: string][] = [
  ["deutscherName", "Deutscher Name"],
  ["englischerName", "Englischer Name"],
  ["familieDeutsch", "Familie (deutsch)"],
  ["familieLateinisch", "Familie (lateinisch)"],
  ["standortHinweis", "Standort-Hinweis", "z. B. „Fensterbank kühl“"],
  ["giesshinweis", "Gießhinweis", "ein Satz"],
  ["substrat", "Substrat", "ein Satz"],
  ["rueckschnitt", "Rückschnitt", "ein Satz"],
  ["wuchsHacks", "Wuchs-Hacks", "ein Satz"],
  ["quelle", "Quelle", "Woher stammen die Angaben? Für die Freigabe nötig."],
];

/** Optionale Angaben: Was du weglässt, heißt später „unbekannt“, es wird nichts erfunden (P-08). */
export function WeitereAngaben() {
  return (
    <details className="neu breit">
      <summary>Weitere Angaben (optional)</summary>
      <div className="formular">
        {TEXTE.map(([name, beschriftung, hilfe]) => (
          <label key={name}>
            {beschriftung}
            <input name={name} maxLength={200} autoComplete="off" />
            {hilfe && <span className="leise">{hilfe}</span>}
          </label>
        ))}
        <label>
          Ruhephase von (Monat-Tag)
          <input name="ruheVon" inputMode="numeric" pattern="\d\d-\d\d" placeholder="11-15" />
        </label>
        <label>
          Ruhephase bis (Monat-Tag)
          <input name="ruheBis" inputMode="numeric" pattern="\d\d-\d\d" placeholder="02-28" />
          <span className="leise">Beide Angaben zusammen oder keine.</span>
        </label>
        <label className="breit">
          Synonyme (eins pro Zeile)
          <textarea name="synonyme" rows={2} />
        </label>
        <label className="breit">
          Botanische Story
          <textarea name="botanischeStory" maxLength={1000} rows={3} />
        </label>
      </div>
    </details>
  );
}

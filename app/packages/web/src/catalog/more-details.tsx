const TEXTS: [name: string, label: string, help?: string][] = [
  ["germanName", "Deutscher Name"],
  ["englishName", "Englischer Name"],
  ["familyGerman", "Familie (deutsch)"],
  ["familyLatin", "Familie (lateinisch)"],
  ["locationHint", "Standort-Hinweis", "z. B. „Fensterbank kühl“"],
  ["wateringHint", "Gießhinweis", "ein Satz"],
  ["substrate", "Substrat", "ein Satz"],
  ["pruning", "Rückschnitt", "ein Satz"],
  ["growthHacks", "Wuchs-Hacks", "ein Satz"],
  ["source", "Quelle", "Woher stammen die Angaben? Für die Freigabe nötig."],
];

/** Optional details: what you leave out later means "unknown", nothing is invented (P-08). */
export function MoreDetails() {
  return (
    <details className="fresh wide">
      <summary>Weitere Angaben (optional)</summary>
      <div className="form">
        {TEXTS.map(([name, label, help]) => (
          <label key={name}>
            {label}
            <input name={name} maxLength={200} autoComplete="off" />
            {help && <span className="quiet">{help}</span>}
          </label>
        ))}
        <label>
          Ruhephase von (Monat-Tag)
          <input name="dormancyFrom" inputMode="numeric" pattern="\d\d-\d\d" placeholder="11-15" />
        </label>
        <label>
          Ruhephase bis (Monat-Tag)
          <input name="dormancyUntil" inputMode="numeric" pattern="\d\d-\d\d" placeholder="02-28" />
          <span className="quiet">Beide Angaben zusammen oder keine.</span>
        </label>
        <label className="wide">
          Synonyme (eins pro Zeile)
          <textarea name="synonyms" rows={2} />
        </label>
        <label className="wide">
          Botanische Story
          <textarea name="botanicalStory" maxLength={1000} rows={3} />
        </label>
      </div>
    </details>
  );
}

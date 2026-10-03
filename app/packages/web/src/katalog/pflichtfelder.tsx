import { SCHWIERIGKEIT, WACHSTUM } from "./text";

function Wahl(props: { name: string; beschriftung: string; optionen: [string, string][] }) {
  return (
    <label>
      {props.beschriftung} *
      <select name={props.name} required defaultValue="">
        <option value="">Bitte wählen</option>
        {props.optionen.map(([wert, text]) => (
          <option key={wert} value={wert}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Die Pflichtfelder aus DM-BES-01 (FR-BES-05); alles Weitere steht in „Weitere Angaben“. */
export function Pflichtfelder(props: { start: string }) {
  return (
    <>
      <label>
        Lateinischer Name *
        <input
          name="lateinischerName"
          required
          maxLength={120}
          defaultValue={props.start}
          autoComplete="off"
          placeholder="z. B. Dracaena trifasciata"
        />
        <span className="leise">Gattung, Epitheton, Sorte nur in Anführungszeichen.</span>
      </label>
      <Wahl
        name="schwierigkeit"
        beschriftung="Schwierigkeit"
        optionen={Object.entries(SCHWIERIGKEIT)}
      />
      <Wahl
        name="standardStufe"
        beschriftung="Standard-Stufe (Lichtzone)"
        optionen={[2, 3, 4].map((s): [string, string] => [String(s), `Stufe ${s}`])}
      />
      <label>
        Lichtbedarf für maximales Wachstum (Lux) *
        <input
          name="lichtbedarfLux"
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
        />
      </label>
      <Wahl name="wachstumsmass" beschriftung="Wachstumsmaß" optionen={Object.entries(WACHSTUM)} />
      <label className="breit">
        Vergeilung-Anzeichen *
        <textarea name="vergeilungAnzeichen" required maxLength={1000} rows={3} />
      </label>
      <label className="breit">
        Erfolgskriterien *
        <textarea name="erfolgskriterien" required maxLength={1000} rows={3} />
      </label>
    </>
  );
}

import { DIFFICULTY, GROWTH } from "./text";

function Choice(props: { name: string; label: string; options: [string, string][] }) {
  return (
    <label>
      {props.label} *
      <select name={props.name} required defaultValue="">
        <option value="">Bitte wählen</option>
        {props.options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The required fields from DM-BES-01 (FR-BES-05); everything else is in "More details". */
export function RequiredFields(props: { start: string }) {
  return (
    <>
      <label>
        Lateinischer Name *
        <input
          name="latinName"
          required
          maxLength={120}
          defaultValue={props.start}
          autoComplete="off"
          placeholder="z. B. Dracaena trifasciata"
        />
        <span className="quiet">Gattung, Epitheton, Sorte nur in Anführungszeichen.</span>
      </label>
      <Choice name="difficulty" label="Schwierigkeit" options={Object.entries(DIFFICULTY)} />
      <Choice
        name="standardLevel"
        label="Standard-Stufe (Lichtzone)"
        options={[2, 3, 4].map((s): [string, string] => [String(s), `Stufe ${s}`])}
      />
      <label>
        Lichtbedarf für maximales Wachstum (Lux) *
        <input
          name="lightDemandLux"
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={200000}
          step={1}
        />
      </label>
      <Choice name="growthMeasure" label="Wachstumsmaß" options={Object.entries(GROWTH)} />
      <label className="wide">
        Vergeilung-Anzeichen *
        <textarea name="etiolationSigns" required maxLength={1000} rows={3} />
      </label>
      <label className="wide">
        Erfolgskriterien *
        <textarea name="successCriteria" required maxLength={1000} rows={3} />
      </label>
    </>
  );
}

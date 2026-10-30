import type { Control } from "react-hook-form";
import { AreaField, ChoiceField, TextField } from "../field-controls/field-controls";
import type { ProposalFields } from "../../shared/schemas";
import { DIFFICULTY, GROWTH } from "../../shared/text";

const LEVELS = [2, 3, 4].map((s): [string, string] => [String(s), `Stufe ${s}`]);

function ChoiceFields({ control }: { control: Control<ProposalFields> }) {
  return (
    <>
      <ChoiceField
        control={control}
        name="difficulty"
        label="Schwierigkeit"
        emptyLabel="Unbekannt"
        options={Object.entries(DIFFICULTY)}
      />
      <ChoiceField
        control={control}
        name="standardLevel"
        label="Standard-Stufe (Lichtzone)"
        emptyLabel="Unbekannt"
        options={LEVELS}
      />
      <TextField
        control={control}
        name="lightDemandLux"
        label="Lichtbedarf für maximales Wachstum (Lux)"
        help="Nur mit Beleg in „Quelle“ eintragen; leer bleibt der Wert unbekannt."
        type="number"
        inputMode="numeric"
        min={1}
        max={200000}
        step={1}
      />
      <ChoiceField
        control={control}
        name="softLeaf"
        label="Weichblättrige C3-Pflanze (sonnenliebend)"
        emptyLabel="Nein (Standard)"
        options={[
          ["no", "Nein"],
          ["yes", "Ja"],
        ]}
        help="Bei „Ja“ steigt die Art bei der Lichtzonen-Ableitung nie automatisch in die stärkere Zone auf; bleibt es leer, gilt „Nein“."
      />
      <ChoiceField
        control={control}
        name="growthMeasure"
        label="Wachstumsmaß"
        required
        options={Object.entries(GROWTH)}
      />
    </>
  );
}

/**
 * The core fields from DM-BES-01 (FR-BES-05); everything else is in "More details". Difficulty, default level and lux
 * need are optional: without a source they stay unknown (P-08, issue 1003).
 */
export function RequiredFields({ control }: { control: Control<ProposalFields> }) {
  return (
    <>
      <TextField
        control={control}
        name="latinName"
        label="Lateinischer Name"
        required
        wide
        maxLength={120}
        autoComplete="off"
        placeholder="z. B. Dracaena trifasciata"
        help="Gattung, Epitheton, Sorte nur in Anführungszeichen."
      />
      <ChoiceFields control={control} />
      <AreaField
        control={control}
        name="etiolationSigns"
        label="Vergeilung-Anzeichen"
        required
        wide
        rows={3}
        maxLength={1000}
      />
      <AreaField
        control={control}
        name="successCriteria"
        label="Erfolgskriterien"
        required
        wide
        rows={3}
        maxLength={1000}
      />
    </>
  );
}

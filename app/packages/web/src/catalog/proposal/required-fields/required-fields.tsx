import type { Control } from "react-hook-form";
import { AreaField, ChoiceField, TextField } from "../field-controls/field-controls";
import type { ProposalFields } from "../../shared/schemas";
import { DIFFICULTY, GROWTH } from "../../shared/text";

const LEVELS = [2, 3, 4].map((s): [string, string] => [String(s), `Stufe ${s}`]);

function LightFields({ control }: { control: Control<ProposalFields> }) {
  return (
    <>
      <div className="grid grid-cols-2 items-start gap-3 md:col-span-2">
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
      </div>
      <TextField
        control={control}
        name="lightDemandLux"
        label="Lichtbedarf für maximales Wachstum (Lux)"
        help="Nur mit Beleg in „Quelle“; leer bleibt der Wert unbekannt."
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
        help="Bei „Ja“ steigt die Art nie automatisch in die stärkere Zone auf; leer gilt „Nein“."
      />
    </>
  );
}

/** Step 1 of the proposal (US-QS-21): the name and the growth measure, the first required fields (FR-BES-05). */
export function NameStepFields({ control }: { control: Control<ProposalFields> }) {
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

/** Step 2 of the proposal (US-QS-21): the two required texts that describe the species (FR-BES-05). */
export function TextStepFields({ control }: { control: Control<ProposalFields> }) {
  return (
    <>
      <AreaField
        control={control}
        name="etiolationSigns"
        label="Vergeilung-Anzeichen"
        required
        wide
        rows={2}
        maxLength={1000}
      />
      <AreaField
        control={control}
        name="successCriteria"
        label="Erfolgskriterien"
        required
        wide
        rows={2}
        maxLength={1000}
      />
    </>
  );
}

/** The fields of step 1; a refusal of one of them leads back to that step. */
export const REQUIRED_STEP: readonly (keyof ProposalFields)[] = ["latinName", "growthMeasure"];

/**
 * Step 2 of the proposal, after the two texts: what is known about the light (difficulty, default level and lux need
 * are optional: without a source they stay unknown, P-08, issue 1003); everything else is in "More details".
 */
export function LightStepFields({ control }: { control: Control<ProposalFields> }) {
  return <LightFields control={control} />;
}

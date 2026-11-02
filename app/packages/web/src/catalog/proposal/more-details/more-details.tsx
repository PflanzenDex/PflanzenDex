import type { Control } from "react-hook-form";
import { FormMoreFields } from "@/components/ui/fields/form/more-fields/more-fields";
import { AreaField, TextField } from "../field-controls/field-controls";
import { LightStepFields } from "../required-fields/required-fields";
import type { ProposalFields } from "../../shared/schemas";

const TEXTS: [name: keyof ProposalFields, label: string, help?: string][] = [
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

/** Every optional field of step 2: the light demand and the details. A value or a refusal in one opens "Mehr Angaben". */
const OPTIONAL: readonly (keyof ProposalFields)[] = [
  ...TEXTS.map(([name]) => name),
  "difficulty",
  "standardLevel",
  "lightDemandLux",
  "softLeaf",
  "dormancyFrom",
  "dormancyUntil",
  "synonyms",
  "botanicalStory",
];

function DetailFields({ control }: { control: Control<ProposalFields> }) {
  return (
    <>
      {TEXTS.map(([name, label, help]) => (
        <TextField
          key={name}
          control={control}
          name={name}
          label={label}
          maxLength={200}
          autoComplete="off"
          {...(help ? { help } : {})}
        />
      ))}
      <TextField
        control={control}
        name="dormancyFrom"
        label="Ruhephase von (Monat-Tag)"
        inputMode="numeric"
        placeholder="11-15"
      />
      <TextField
        control={control}
        name="dormancyUntil"
        label="Ruhephase bis (Monat-Tag)"
        inputMode="numeric"
        placeholder="02-28"
        help="Beide Angaben zusammen oder keine."
      />
      <AreaField
        control={control}
        name="synonyms"
        label="Synonyme (eins pro Zeile)"
        wide
        rows={2}
      />
      <AreaField
        control={control}
        name="botanicalStory"
        label="Botanische Story"
        wide
        rows={3}
        maxLength={1000}
      />
    </>
  );
}

/**
 * The optional part of step 2 (US-QS-21, US-QS-24): the light demand and the details behind "Mehr Angaben". What is left
 * out later means "unknown", nothing is invented (P-08); a refused field opens the group, so the focus can reach it (P-10).
 */
export function MoreDetails({ control }: { control: Control<ProposalFields> }) {
  return (
    <FormMoreFields control={control} names={OPTIONAL} className="md:col-span-2">
      <div className="grid gap-4 md:grid-cols-2">
        <LightStepFields control={control} />
        <DetailFields control={control} />
      </div>
    </FormMoreFields>
  );
}

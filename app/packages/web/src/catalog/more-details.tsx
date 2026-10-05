import { useEffect, useRef, useState } from "react";
import { useFormState, type Control } from "react-hook-form";
import { AreaField, TextField } from "./field-controls";
import type { ProposalFields } from "./schemas";

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

const OPTIONAL = [
  ...TEXTS.map(([name]) => name),
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
 * Optional details: what you leave out later means "unknown", nothing is invented (P-08). The section opens by
 * itself when one of its fields is refused, so the focus can reach the field.
 */
export function MoreDetails({ control }: { control: Control<ProposalFields> }) {
  const { errors } = useFormState({ control });
  const invalid = OPTIONAL.some((name) => name in errors);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (invalid) box.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [invalid]);
  return (
    <details
      open={open || invalid}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-lg border border-border p-3 md:col-span-2"
    >
      <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Weitere Angaben (optional)
      </summary>
      <div ref={box} className="mt-2 grid gap-4 md:grid-cols-2">
        <DetailFields control={control} />
      </div>
    </details>
  );
}

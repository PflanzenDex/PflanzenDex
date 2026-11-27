import { useWatch, type Control } from "react-hook-form";
import { texts } from "@/shared/lib/text-rules/texts";
import { Field } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { POT_TYPE } from "../../labels";
import table from "../../equipment.de.json";
import type { EquipmentFields } from "../../schemas";
import { POT_FORM } from "../pot-form";

const t = texts(table);

/**
 * The fields of a pot (US-BES-19, DM-EQU-05): diameter, height, material and drainage, shown for the type "Topf" only.
 * Each one left empty or "Unbekannt" stays unknown (P-08). Other types show none of them and send none. All four are
 * optional (SG-FORM-01); the size range is named only in its error text (pot.sizeInvalid).
 */
export function PotFields({ control }: { control: Control<EquipmentFields> }) {
  const type = useWatch({ control, name: "type" });
  if (type !== POT_TYPE) return null;
  return (
    <fieldset className="grid gap-4 border-0 p-0">
      <legend className="mb-2 font-semibold">{t("pot.legend")}</legend>
      <Field
        control={control}
        name="diameterCm"
        label={t("pot.diameterField")}
        optional
        suffix="cm"
      >
        {(field) => <Input {...field} inputMode="decimal" autoComplete="off" />}
      </Field>
      <Field control={control} name="heightCm" label={t("pot.heightField")} optional suffix="cm">
        {(field) => <Input {...field} inputMode="decimal" autoComplete="off" />}
      </Field>
      <Field control={control} name="material" label={t("pot.materialField")} optional>
        {(field) => <Input {...field} autoComplete="off" maxLength={POT_FORM.material.max} />}
      </Field>
      <Field control={control} name="drainage" label={t("pot.drainageField")} optional>
        {(field) => (
          <Select {...field}>
            <option value="unknown">{t("pot.drainageUnknown")}</option>
            <option value="yes">{t("pot.drainageYes")}</option>
            <option value="no">{t("pot.drainageNo")}</option>
          </Select>
        )}
      </Field>
    </fieldset>
  );
}

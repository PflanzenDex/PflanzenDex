import type { Control } from "react-hook-form";
import { texts } from "@/shared/lib/text-rules/texts";
import { Field } from "@/shared/ui/fields/form/field/field";
import { Select } from "@/shared/ui/fields/select/select";
import type { RepotFields } from "../../../../specimens/model/schemas";
import { potItemText, potSizeText } from "../../repot-plan/pot-text";
import type { RepotPlanView } from "../../repot-api";
import table from "../../repot.de.json";

const t = texts(table);

/** "In welchen Topf?": the recorded pot first (preselected, placing into it changes nothing), then the free pots, then none. */
export function PotField(props: { control: Control<RepotFields>; plan: RepotPlanView }) {
  const { currentPot, freePots } = props.plan;
  return (
    <Field control={props.control} name="potId" label={t("pot.label")}>
      {(field) => (
        <Select {...field}>
          {currentPot ? (
            <option value={currentPot.id}>
              {t("pot.itemCurrent", { name: currentPot.name, size: potSizeText(currentPot) })}
            </option>
          ) : null}
          {freePots.map((pot) => (
            <option key={pot.id} value={pot.id}>
              {potItemText(pot)}
            </option>
          ))}
          <option value="">{t("pot.none")}</option>
        </Select>
      )}
    </Field>
  );
}

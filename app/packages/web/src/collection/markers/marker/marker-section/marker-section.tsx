import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Form } from "@/shared/ui/fields/form/form";
import type { ApiError } from "../../../../shared/data";
import { useSiblings } from "../../../specimens/cards/use-card-pages";
import type { Token } from "../../../specimens/hooks/use-collection";
import type { CreateFields } from "../../../specimens/model/schemas";
import { MarkerFields } from "../marker-fields/marker-fields";
import { markerRule, type MarkerRule } from "../marker-rule";

export type MarkerSectionProps = {
  /** The form of the flow: it keeps the typed marker when the keeper goes back (US-ONB-01). */
  form: UseFormReturn<CreateFields>;
  api: string;
  token: Token;
  speciesId: string;
  speciesName: string;
  /** A refused create (US-QS-15): the marker field shows and takes the refusal. */
  refusal: ApiError | null;
  /** Reports the rule of the species; `null` while it is read and once the section leaves the step. */
  report: (rule: MarkerRule | null) => void;
};

/**
 * The marker of a further plant on step 2 (US-BES-03, issue 1638): its own chunk, loaded with the step. It reads the
 * plants of the chosen species, reports the rule to the flow (which presets the form and enables the save with a known
 * rule) and shows the field for an owned species or after a refused marker.
 */
export function MarkerSection(props: MarkerSectionProps) {
  const { form, api, token, speciesId, speciesName, refusal, report } = props;
  const siblings = useSiblings(api, token, speciesId, true);
  const rule = useMemo(() => {
    if (siblings.status === "pending") return null;
    return markerRule(siblings.status === "ready" ? (siblings.value ?? []) : []);
  }, [siblings.status, siblings.value]);
  useEffect(() => {
    report(rule);
  }, [report, rule]);
  useEffect(() => () => report(null), [report]);
  if (!rule || (!rule.required && refusal === null)) return null;
  return (
    <Form {...form}>
      <MarkerFields
        control={form.control}
        speciesName={speciesName}
        required={rule.required || refusal !== null}
        missing={rule.missing}
      />
    </Form>
  );
}

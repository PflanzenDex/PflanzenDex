import { useEffect, useMemo } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useServerRefusal } from "@/shared/ui/fields/form/server-refusal";
import type { ApiError } from "../../../shared/data";
import { useToday } from "../catch-date/catch-date-field/catch-date-field";
import { useSiblings } from "../../specimens/cards/use-card-pages";
import type { Token } from "../../specimens/hooks/use-collection";
import { createStart, type CreateFields } from "../../specimens/model/schemas";
import { markerRule, type Sibling } from "./marker-fields/marker-fields";

/** A create the server refuses because the marker is missing or taken: the marker field takes that refusal (US-BES-03). */
export const refusesMarker = (error: ApiError): boolean =>
  error.code === "specimen.marker_required" || error.code === "specimen.marker_taken";

const fieldsOfRefusal = (error: ApiError): "marker"[] => (refusesMarker(error) ? ["marker"] : []);

/** The marker part of a create of a further plant (US-BES-03): what its form holds and which fields to show. */
export type FurtherMarker = {
  form: UseFormReturn<CreateFields>;
  /** The marker rule of the chosen species; `null` while its plants are read. */
  rule: ReturnType<typeof markerRule> | null;
  /**
   * The marker fields to show: for a species the keeper owns, or once the server refused a marker (the field then appears
   * and takes the focus, US-QS-15). `null` shows no marker.
   */
  fields: {
    form: UseFormReturn<CreateFields>;
    required: boolean;
    missing: readonly Sibling[];
  } | null;
};

const NO_PLANTS = markerRule([]);

/**
 * The marker of a further plant (US-BES-03), in the short form as in the long one: the rule comes from the plants the
 * keeper already has of the chosen species, so the preset is the one of the long form (`createStart`). A failed read
 * falls back to "no plants": the server decides and refuses with the field, nothing is guessed (P-03, P-10). A marker
 * refusal of the server is handed to its field, which takes the focus (`useServerRefusal`, DS-49).
 */
export function useFurtherMarker(
  api: string,
  token: Token,
  speciesId: string | null,
  refusal: ApiError | null,
): FurtherMarker {
  const today = useToday();
  const siblings = useSiblings(api, token, speciesId ?? "", speciesId !== null);
  const rule = useMemo(() => {
    if (speciesId === null || siblings.status === "pending") return null;
    return markerRule(siblings.status === "ready" ? (siblings.value ?? []) : []);
  }, [speciesId, siblings.status, siblings.value]);
  const form = useForm<CreateFields>({ defaultValues: createStart(NO_PLANTS, today) });
  useEffect(() => {
    if (rule) form.reset(createStart(rule, today));
  }, [form, rule, today]);
  useServerRefusal(refusal, form.setError, fieldsOfRefusal);
  return {
    form,
    rule,
    fields:
      rule && (rule.required || refusal !== null)
        ? { form, required: rule.required || refusal !== null, missing: rule.missing }
        : null,
  };
}

/**
 * The marker and the answers of a create as the operation takes them (US-BES-03): an empty marker or answer stays out
 * (unknown, P-08), so the server names what is still missing instead of a blank text being refused as invalid.
 */
export function markerInputOf(f: CreateFields, missing: readonly Sibling[]) {
  const marker = f.marker.trim();
  const markers = missing.flatMap((s) => {
    const answer = (f.answers[s.id] ?? "").trim();
    return answer ? [{ specimenId: s.id, marker: answer }] : [];
  });
  return {
    ...(marker ? { marker } : {}),
    ...(markers.length > 0 ? { markers } : {}),
  };
}

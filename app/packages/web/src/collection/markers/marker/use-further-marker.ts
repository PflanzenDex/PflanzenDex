import { useEffect, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { ApiError } from "../../../shared/data";
import { useToday } from "../catch-date/use-today";
import { useSiblings } from "../../specimens/cards/use-card-pages";
import type { Token } from "../../specimens/hooks/use-collection";
import { createStart } from "../../specimens/model/create-start";
import type { CreateFields } from "../../specimens/model/schemas";
import { markerRule, type Sibling } from "./marker-rule";

/** A create the server refuses because the marker is missing or taken: the marker field takes that refusal (US-BES-03). */
export const refusesMarker = (error: ApiError): boolean =>
  error.code === "specimen.marker_required" || error.code === "specimen.marker_taken";

/** The field a refused marker belongs to, for `useServerRefusal` (DS-49), in the flow that owns the form (US-QS-15). */
export const markerRefusalFields = (error: ApiError): "marker"[] =>
  refusesMarker(error) ? ["marker"] : [];

/** The values of the marker form before a species is chosen: no plants yet, so no marker is asked (US-BES-03). */
export const markerFormStart = (today: string): CreateFields => createStart(markerRule([]), today);

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

/**
 * The marker of a further plant (US-BES-03), in the short form as in the long one. The form is the flow's own
 * (`markerFormStart`), so a typed marker survives going back (US-ONB-01); this hook reads the rule from the plants the
 * keeper already has of the chosen species and resets the form to the preset of the long form (`createStart`). A failed
 * read falls back to "no plants": the server decides and refuses with the field, nothing is guessed (P-03, P-10).
 */
export function useFurtherMarker({
  form,
  api,
  token,
  speciesId,
  refusal,
}: {
  form: UseFormReturn<CreateFields>;
  api: string;
  token: Token;
  speciesId: string | null;
  refusal: ApiError | null;
}): FurtherMarker {
  const today = useToday();
  const siblings = useSiblings(api, token, speciesId ?? "", speciesId !== null);
  const rule = useMemo(() => {
    if (speciesId === null || siblings.status === "pending") return null;
    return markerRule(siblings.status === "ready" ? (siblings.value ?? []) : []);
  }, [speciesId, siblings.status, siblings.value]);
  useEffect(() => {
    if (rule) form.reset(createStart(rule, today));
  }, [form, rule, today]);
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

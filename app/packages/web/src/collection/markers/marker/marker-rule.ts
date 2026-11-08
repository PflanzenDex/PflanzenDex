import type { SpecimenCard } from "@pflanzendex/core";
import type { ApiError } from "../../../shared/data";
import { createStart } from "../../specimens/model/create-start";
import type { CreateFields } from "../../specimens/model/schemas";

/** The active specimens of the chosen species, as far as the form needs them (US-BES-03). */
export type Sibling = Pick<SpecimenCard, "id" | "name" | "marker">;

/** Default marker of the naming rule (DM-BES-03): "clip"; only a preset, freely changeable. */
const DEFAULT_MARKER = "Klammer";

/**
 * The rule for the new specimen: the 1st needs no marker, the 2nd and later do, from the 3rd on the others too.
 * Light on purpose: the first-plant flow reads it through the collection barrel, so it carries no form, request or
 * component code (issue 1638).
 */
export function markerRule(siblings: readonly Sibling[]) {
  return {
    required: siblings.length >= 1,
    missing: siblings.length >= 2 ? siblings.filter((s) => s.marker === null) : [],
    preset: siblings.some((s) => s.marker?.toLowerCase() === DEFAULT_MARKER.toLowerCase())
      ? ""
      : DEFAULT_MARKER,
  };
}

/** The rule of one species as the flow keeps it: `null` while the plants of the species are read. */
export type MarkerRule = ReturnType<typeof markerRule>;

/** A create the server refuses because the marker is missing or taken: the marker field takes that refusal (US-BES-03). */
export const refusesMarker = (error: ApiError): boolean =>
  error.code === "specimen.marker_required" || error.code === "specimen.marker_taken";

/** The field a refused marker belongs to, for `useServerRefusal` (DS-49), in the flow that owns the form (US-QS-15). */
export const markerRefusalFields = (error: ApiError): "marker"[] =>
  refusesMarker(error) ? ["marker"] : [];

/**
 * The values of the marker form before a species is chosen: no plants yet, so no marker is asked (US-BES-03). The
 * caller passes the keeper's local today (NFR-08): the barrel exports no `useToday` and reads no `shared/data` module
 * (issue 1638).
 */
export const markerFormStart = (today: string): CreateFields => createStart(markerRule([]), today);

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

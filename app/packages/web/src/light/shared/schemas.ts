import { z } from "zod";

/** Limits as the server enforces them (assumption: mirrored from the API operations, the server decides, P-03). */
export const LUX_LIMITS = [1, 200000] as const;
export const PPFD_LIMITS = [1, 3000] as const;
export const ORDER_LIMITS = [0, 999] as const;
export const NAME_MAX = 60;

const whole = (text: string, [min, max]: readonly [number, number]) => {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
};
const between = ([min, max]: readonly [number, number]) =>
  `Gib eine ganze Zahl zwischen ${min} und ${max} ein.`;

const name = z.string().trim().min(1, "Bitte gib einen Namen ein.").max(NAME_MAX);
const required = (limits: readonly [number, number]) =>
  z.string().refine((t) => whole(t, limits), between(limits));
const optional = (limits: readonly [number, number]) =>
  z.string().refine((t) => t.trim() === "" || whole(t, limits), between(limits));

/** Fields of the zone form (US-LIC-05, DS-47): numbers stay texts until they are sent; the server decides (P-03). */
export const zoneSchema = z.object({
  name,
  luxCeiling: required(LUX_LIMITS),
  ppfd: optional(PPFD_LIMITS),
  sortOrder: optional(ORDER_LIMITS),
});
export type ZoneFields = z.infer<typeof zoneSchema>;

export const locationSchema = z.object({
  name,
  lightZoneId: z.string(),
  kind: z.enum(["indoor", "outdoor"]),
});
export type LocationFields = z.infer<typeof locationSchema>;

export const derivationSchema = z.object({
  lightDemandLux: required(LUX_LIMITS),
  standardLevel: z.enum(["2", "3", "4"]),
  softLeaf: z.boolean(),
});
export type DerivationFields = z.infer<typeof derivationSchema>;

const numberOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export const toZoneInput = (f: ZoneFields) => ({
  name: f.name,
  luxCeiling: Number(f.luxCeiling),
  ppfd: numberOrNull(f.ppfd),
  sortOrder: numberOrNull(f.sortOrder),
});

export const toLocationInput = (f: LocationFields) => ({
  name: f.name,
  lightZoneId: f.lightZoneId || null,
  kind: f.kind,
});

export const toDerivationRequest = (f: DerivationFields) => ({
  lightDemandLux: Number(f.lightDemandLux),
  standardLevel: Number(f.standardLevel),
  softLeaf: f.softLeaf,
});

/** Fields of each form a server refusal can point at, in the order of the form. */
export const ZONE_REFUSABLE = ["name", "luxCeiling", "ppfd", "sortOrder"] as const;
export const LOCATION_REFUSABLE = ["name", "lightZoneId", "kind"] as const;
export const DERIVATION_REFUSABLE = ["lightDemandLux", "standardLevel"] as const;

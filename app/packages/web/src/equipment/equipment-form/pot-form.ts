// The pot fields of the equipment form (US-BES-19, DM-EQU-05): their limits, the check of a typed size and the API values.

/**
 * The limits of a pot in the form: a size in centimetres from 1 to 300 with at most one decimal, the material up to 60
 * characters. Starting values (assumption); they mirror `POT_LIMITS` of core, which the package root does not export, and
 * the server checks the same values again (P-03).
 */
export const POT_FORM = {
  sizeCm: { min: 1, max: 300 },
  material: { max: 60 },
} as const;

const SIZE_CM = /^\d{1,3}([.,]\d)?$/;

/** A pot size as typed: a decimal comma or point, one decimal at most, within the limits. */
export function isSizeCm(v: string): boolean {
  if (!SIZE_CM.test(v)) return false;
  const n = Number(v.replace(",", "."));
  return n >= POT_FORM.sizeCm.min && n <= POT_FORM.sizeCm.max;
}

/** The pot fields of the API input (US-BES-19); `null` = unknown (P-08). */
export type PotInput = {
  diameterCm?: number | null;
  heightCm?: number | null;
  material?: string | null;
  drainage?: boolean | null;
};

/** The pot fields of a checked pot: what is unknown is `null` (P-08), a drainage "Unbekannt" too. */
export function potInput(f: {
  diameterCm: string;
  heightCm: string;
  material: string;
  drainage: "unknown" | "yes" | "no";
}): PotInput {
  const size = (v: string): number | null =>
    v.trim() === "" ? null : Number(v.trim().replace(",", "."));
  return {
    diameterCm: size(f.diameterCm),
    heightCm: size(f.heightCm),
    material: f.material.trim() === "" ? null : f.material.trim(),
    drainage: f.drainage === "unknown" ? null : f.drainage === "yes",
  };
}

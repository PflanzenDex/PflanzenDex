/** A whole number of at least 1 from a text field; empty is `null` (unknown, P-08), anything else invalid is `NaN`. */
export function wholeNumber(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return /^\d{1,7}$/.test(t) ? Number(t) : Number.NaN;
}

export const lux = (n: number): string => `${n.toLocaleString("de-DE")} lx`;

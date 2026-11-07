const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Case, accents, dashes, brackets and repeated spaces do not matter: "Aloe vera (blau)" = "Aloe vera – blau". */
export const normalizeName = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Stable string of an input (key order irrelevant) as a fingerprint for idempotency. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const fields = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compare(a, b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const vergleiche = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Stabile Zeichenkette einer Eingabe (Schlüsselreihenfolge egal) als Fingerabdruck für die Idempotenz. */
export function kanonisch(wert: unknown): string {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
  if (typeof wert === "object" && wert !== null) {
    const felder = Object.entries(wert)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => vergleiche(a, b))
      .map(([k, v]) => `${JSON.stringify(k)}:${kanonisch(v)}`);
    return `{${felder.join(",")}}`;
  }
  return JSON.stringify(wert) ?? "null";
}

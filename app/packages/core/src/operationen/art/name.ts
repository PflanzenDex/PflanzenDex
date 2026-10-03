// Namen von Arten (DM-BES-01): lateinischer Name in Normalform und Normierung für Suche und Dubletten.

export interface LateinischerName {
  readonly gattung: string;
  readonly epitheton: string | null;
  readonly sorte: string | null;
  /** Anzeigeform: „Gattung epitheton 'Sorte'“. */
  readonly anzeige: string;
}

// Gattung, optional Epitheton, optional Sorte nur in Anführungszeichen. `var.`, `subsp.` und `f.` gehören zum
// Exemplar (Zusatz, DM-BES-02) und nicht in den Art-Namen; sie lassen sich hier nicht schreiben.
const NAME = /^([\p{L}-]{2,40})(?:\s+([\p{L}-]{2,40}))?(?:\s+['‘"„]([^'’"“”‘„]{1,60})['’"“”])?$/u;

const grossAnfang = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Zerlegt einen lateinischen Namen; `null`, wenn er nicht dem Muster entspricht. */
export function parseLateinisch(text: string): LateinischerName | null {
  const m = NAME.exec(text.trim().replace(/\s+/g, " "));
  if (!m) return null;
  const gattung = grossAnfang(m[1] ?? "");
  const epitheton = m[2] ? m[2].toLowerCase() : null;
  const sorte = m[3]?.trim() || null;
  const anzeige = [gattung, epitheton, sorte && `'${sorte}'`].filter(Boolean).join(" ");
  return { gattung, epitheton, sorte, anzeige };
}

/** Klein, ohne Akzente, ß als ss, Satzzeichen wie Leerzeichen: gleiche Namen ergeben denselben Schlüssel. */
export function normalisiere(text: string): string {
  return text
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

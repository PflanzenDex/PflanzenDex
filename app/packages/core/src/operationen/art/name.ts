// Namen von Arten (DM-BES-01): lateinischer Name in Normalform und Normierung für Suche und Dubletten.

export interface LateinischerName {
  readonly gattung: string;
  readonly epitheton: string | null;
  readonly sorte: string | null;
  /** Anzeigeform: „Gattung epitheton 'Sorte'“. */
  readonly anzeige: string;
}

// Die Sorte steht nur in Anführungszeichen am Ende. `var.`, `subsp.` und `f.` gehören zum Exemplar
// (Zusatz, DM-BES-02) und nicht in den Art-Namen; sie lassen sich hier nicht schreiben.
const SORTE = /\s+['‘"„]([^'’"“”‘„]{1,60})['’"“”]$/u;
const WORT = /^[\p{L}-]{2,40}$/u;

const grossAnfang = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const worteGueltig = (w: string[]) => w.length <= 2 && w.every((x) => WORT.test(x));

/** Zerlegt einen lateinischen Namen; `null`, wenn er nicht dem Muster entspricht. */
export function parseLateinisch(text: string): LateinischerName | null {
  let rest = text.trim().replace(/\s+/g, " ");
  const sorte = SORTE.exec(rest)?.[1]?.trim() || null;
  if (sorte) rest = rest.replace(SORTE, "");
  const worte = rest.split(" ");
  const [g, e] = worte;
  if (!worteGueltig(worte) || !g) return null;
  const gattung = grossAnfang(g);
  const epitheton = e ? e.toLowerCase() : null;
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

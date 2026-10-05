/**
 * The key by which wish names are unique per account (FR-WUN-06): Unicode decomposed, combining marks (diacritics)
 * removed, lower case. "Café", "CAFÉ", "Cafe" and "Cafe" + combining accent are one name. Letters that are not an
 * accented base letter (ß, ø) stay as they are, so "Straße" and "Strasse" remain two names. The migration that
 * backfilled existing wishes (0020) uses the same steps in SQL: `lower(regexp_replace(normalize(name, NFD),
 * '[̀-ͯ]', '', 'g'))`. Linear scan, no regular expression on user text.
 */
export function wishNameKey(name: string): string {
  return [...name.normalize("NFD")]
    .filter((ch) => ch < "̀" || ch > "ͯ")
    .join("")
    .toLowerCase();
}

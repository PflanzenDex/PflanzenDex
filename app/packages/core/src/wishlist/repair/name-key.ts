/**
 * The key by which wish names are unique per account (FR-WUN-06): Unicode decomposed, combining marks (diacritics,
 * U+0300 to U+036F) removed, lower case, runs of white space collapsed to one blank, trimmed. "Café", "CAFÉ",
 * "Cafe" and "Cafe" + combining accent are one name, and so are "Aloe  vera" and "Aloe vera". Letters that are not an
 * accented base letter (ß, ø) stay as they are, so "Straße" and "Strasse" remain two names. The migration that
 * backfilled existing wishes (0020) takes the same steps in SQL. No regular expression with repetition on user text.
 */
export function wishNameKey(name: string): string {
  const folded = [...name.normalize("NFD")]
    .filter((ch) => ch < "\u0300" || ch > "\u036f")
    .join("")
    .toLowerCase();
  return folded
    .split(/\s/u)
    .filter((part) => part !== "")
    .join(" ");
}

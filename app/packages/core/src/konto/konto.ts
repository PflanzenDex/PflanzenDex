/** Kontodaten, wie der Anmeldedienst sie im geprüften Token bestätigt (Passwörter gehören nie hierher, FR-ACC-03). */
export type Kontodaten = {
  subjekt: string;
  email: string;
  anzeigename: string | null;
  emailBestaetigt: boolean;
};

const text = (wert: unknown): string | null =>
  typeof wert === "string" && wert.trim() !== "" ? wert.trim() : null;

/**
 * Liest die Kontodaten aus den Ansprüchen (Claims) eines bereits geprüften Tokens.
 * Gibt `null` zurück, wenn Subjekt oder E-Mail fehlen. Bestätigt ist die Adresse nur bei dem Wert `true`.
 */
export function kontoAusAnspruechen(ansprueche: Record<string, unknown>): Kontodaten | null {
  const subjekt = text(ansprueche["sub"]);
  const email = text(ansprueche["email"]);
  if (!subjekt || !email) return null;
  return {
    subjekt,
    email: email.toLowerCase(),
    anzeigename: text(ansprueche["name"]),
    emailBestaetigt: ansprueche["email_verified"] === true,
  };
}

/** Ein Konto teilt Daten erst mit Freunden, wenn die E-Mail-Adresse bestätigt ist (US-ACC-01, P-05). */
export function darfMitFreundenTeilen(konto: Kontodaten): boolean {
  return konto.emailBestaetigt;
}

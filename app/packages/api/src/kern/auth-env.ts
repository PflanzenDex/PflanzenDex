import type { Kontodaten } from "@pflanzendex/core";

/** Konto der aktuellen Anfrage; die Authentifizierung (Modul `konto`) setzt es, andere Module lesen es nur. */
type AnfrageKonto = { id: string; daten: Kontodaten };
export type AuthEnv = { Variables: { konto: AnfrageKonto } };

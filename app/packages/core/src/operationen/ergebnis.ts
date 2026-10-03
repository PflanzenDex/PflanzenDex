import type { Fehler } from "./fehler";

export type Ergebnis<T> =
  { readonly ok: true; readonly wert: T } | { readonly ok: false; readonly fehler: Fehler };

export const ok = <T>(wert: T): Ergebnis<T> => ({ ok: true, wert });
export const fehlgeschlagen = (f: Fehler): Ergebnis<never> => ({ ok: false, fehler: f });

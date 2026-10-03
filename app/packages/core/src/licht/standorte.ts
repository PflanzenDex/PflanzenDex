import { definiereOperation } from "../kern/operation";
import { fehler } from "../kern/fehler";
import { fehlgeschlagen, ok, type Ergebnis } from "../kern/ergebnis";
import { standortAenderSchema, standortSchema } from "./felder";
import type { LichtStandort, LichtStandortSpeicher } from "./typen";

type Antwort = LichtStandort | "name_vergeben" | "nicht_gefunden" | "zone_unbekannt";

const ergebnis = (r: Antwort): Ergebnis<LichtStandort> => {
  if (r === "name_vergeben") return fehlgeschlagen(fehler("standort.name_vergeben"));
  if (r === "nicht_gefunden") return fehlgeschlagen(fehler("standort.nicht_gefunden"));
  if (r === "zone_unbekannt") return fehlgeschlagen(fehler("lichtzone.nicht_gefunden"));
  return ok(r);
};

/** Ein Standort gehört zu höchstens einer Zone; ohne Zone erscheint er in den Hinweisen. */
export const standortEinrichten = (standorte: LichtStandortSpeicher) =>
  definiereOperation({
    name: "standort.einrichten",
    schema: standortSchema,
    ausfuehren: async (kontext, eingabe) =>
      ergebnis(await standorte.anlegen(kontext.nutzerId, eingabe)),
  });

/** Umbenennen, Zone oder Art ändern; die Kennung bleibt, Exemplare verweisen darauf (nicht auf den Namen). */
export const standortAendern = (standorte: LichtStandortSpeicher) =>
  definiereOperation({
    name: "standort.aendern",
    schema: standortAenderSchema,
    ausfuehren: async (kontext, { id, ...werte }) =>
      ergebnis(await standorte.aendern(kontext.nutzerId, id, werte)),
  });

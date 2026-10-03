import { definiereOperation, fehler, fehlgeschlagen, ok, type Ergebnis, objekt } from "../kern";
import { zonenAenderSchema, zonenKennungSchema, zonenSchema } from "./felder";
import type { Lichtzone, ZonenNutzung, ZonenSpeicher, ZonenWerte } from "./typen";

/** Voreinstellung der Lichtzonen aus der Spezifikation (03-Licht-und-Standorte.md), gilt für neue Konten. */
export const ZONEN_VOREINSTELLUNG: readonly ZonenWerte[] = [
  { name: "Lampe 1", luxDecke: 1_500, ppfd: 36, reihenfolge: 1 },
  { name: "Lampe 2", luxDecke: 15_000, ppfd: 300, reihenfolge: 2 },
  { name: "Lampe 3", luxDecke: 100_000, ppfd: 1_600, reihenfolge: 3 },
  { name: "Lampe 4", luxDecke: 110_000, ppfd: 2_000, reihenfolge: 4 },
];

const speichern = (r: Lichtzone | "name_vergeben" | "nicht_gefunden"): Ergebnis<Lichtzone> => {
  if (r === "name_vergeben") return fehlgeschlagen(fehler("lichtzone.name_vergeben"));
  if (r === "nicht_gefunden") return fehlgeschlagen(fehler("lichtzone.nicht_gefunden"));
  return ok(r);
};

export const lichtzoneAnlegen = (zonen: ZonenSpeicher) =>
  definiereOperation({
    name: "lichtzone.anlegen",
    schema: zonenSchema,
    ausfuehren: async (kontext, eingabe) =>
      speichern(await zonen.anlegen(kontext.nutzerId, eingabe)),
  });

/** Umbenennen und Ändern: die Kennung bleibt, Zuordnungen verweisen auf sie und bleiben unberührt. */
export const lichtzoneAendern = (zonen: ZonenSpeicher) =>
  definiereOperation({
    name: "lichtzone.aendern",
    schema: zonenAenderSchema,
    ausfuehren: async (kontext, { id, ...werte }) =>
      speichern(await zonen.aendern(kontext.nutzerId, id, werte)),
  });

/**
 * Löscht eine Zone nur, wenn niemand sie nutzt; sonst nennt der Fehler alle Nutzer (P-10).
 * `nutzungen` sind alle Quellen, die eine Zone belegen können (Standorte, später Exemplare und Arten).
 */
export const lichtzoneLoeschen = (zonen: ZonenSpeicher, nutzungen: readonly ZonenNutzung[]) => {
  const nutzer = async (nutzerId: string, id: string) =>
    (await Promise.all(nutzungen.map((q) => q.nutzer(nutzerId, id)))).flat();
  const belegt = async (nutzerId: string, id: string) =>
    fehlgeschlagen(fehler("lichtzone.in_benutzung", { daten: await nutzer(nutzerId, id) }));
  return definiereOperation({
    name: "lichtzone.loeschen",
    schema: zonenKennungSchema,
    ausfuehren: async (kontext, { id }) => {
      const eigene = (await zonen.liste(kontext.nutzerId)).some((z) => z.id === id);
      if (!eigene) return fehlgeschlagen(fehler("lichtzone.nicht_gefunden"));
      if ((await nutzer(kontext.nutzerId, id)).length > 0) return belegt(kontext.nutzerId, id);
      const r = await zonen.loeschen(kontext.nutzerId, id);
      if (r === "in_benutzung") return belegt(kontext.nutzerId, id);
      return r === "geloescht" ? ok({ id }) : fehlgeschlagen(fehler("lichtzone.nicht_gefunden"));
    },
  });
};

/** Legt die vier Lampen der Voreinstellung an, aber nur für ein Konto ohne Zonen (nichts wird überschrieben). */
export const lichtzoneVoreinstellung = (zonen: ZonenSpeicher) =>
  definiereOperation({
    name: "lichtzone.voreinstellung",
    schema: objekt({}),
    ausfuehren: async (kontext) => {
      if ((await zonen.liste(kontext.nutzerId)).length > 0)
        return fehlgeschlagen(fehler("lichtzone.nicht_leer"));
      const angelegt: Lichtzone[] = [];
      for (const werte of ZONEN_VOREINSTELLUNG) {
        const r = await zonen.anlegen(kontext.nutzerId, werte);
        if (r === "name_vergeben") return fehlgeschlagen(fehler("lichtzone.name_vergeben"));
        angelegt.push(r);
      }
      return ok(angelegt as readonly Lichtzone[]);
    },
  });

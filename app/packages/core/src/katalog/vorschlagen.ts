import {
  definiereOperation,
  fehler,
  fehlgeschlagen,
  ok,
  bezeichnerFeld,
  kennungFeld,
  objekt,
  wahlFeld,
} from "../kern";
import { istPruefer } from "./rechte";
import { VORSCHLAG_STATUS, type PruefungSpeicher } from "./typen";

const objektFelder = {
  objektArt: bezeichnerFeld("objektArt", 40),
  objektId: kennungFeld("objektId"),
};

const vorschlagSchema = objekt({ ...objektFelder, status: wahlFeld("status", VORSCHLAG_STATUS) });
const kuratierSchema = objekt(objektFelder);

/** Jeder angemeldete Nutzer darf vorschlagen (FR-BES-02); der Vorschlag bleibt privat, bis ein Prüfer entscheidet. */
export const katalogVorschlagen = (speicher: PruefungSpeicher) =>
  definiereOperation({
    name: "katalog.vorschlagen",
    schema: vorschlagSchema,
    ausfuehren: async (kontext, eingabe) => {
      const r = await speicher.anlegen(kontext.nutzerId, eingabe);
      return r === "vorhanden" ? fehlgeschlagen(fehler("pruefung.bereits_vorhanden")) : ok(r);
    },
  });

/** Betreiber-Batch: sofort sichtbar und als `kuratiert` gekennzeichnet (FR-BES-11); nur für Prüfer. */
export const katalogKuratieren = (speicher: PruefungSpeicher) =>
  definiereOperation({
    name: "katalog.kuratieren",
    schema: kuratierSchema,
    berechtigt: istPruefer(speicher),
    ausfuehren: async (kontext, eingabe) => {
      const r = await speicher.anlegen(kontext.nutzerId, { ...eingabe, status: "kuratiert" });
      return r === "vorhanden" ? fehlgeschlagen(fehler("pruefung.bereits_vorhanden")) : ok(r);
    },
  });

import { definiereOperation } from "../operation";
import { fehler, type Fehlerdetail } from "../fehler";
import { fehlgeschlagen, ok } from "../ergebnis";
import { kennungFeld, objekt, wahlFeld } from "../validierung";
import { istPruefer } from "./rechte";
import { ENTSCHEIDUNGS_STATUS, GRUND_MAX, OFFEN, type PruefungSpeicher } from "./typen";

// Der Grund ist im Schema optional; ob er nötig ist, hängt vom Status ab (siehe ausfuehren).
const grundFeld = (wert: unknown): string | null | Fehlerdetail => {
  if (wert === undefined || wert === null || wert === "") return null;
  if (typeof wert === "string" && wert.trim().length <= GRUND_MAX) return wert.trim() || null;
  return { feld: "grund", code: "eingabe.ungueltig" };
};

const pruefSchema = objekt({
  id: kennungFeld("id"),
  status: wahlFeld("status", ENTSCHEIDUNGS_STATUS),
  grund: grundFeld,
});

/**
 * Freigeben oder mit Grund zurückweisen (US-BES-10). Nur Prüfer (FR-BES-14); eine KI-Verbindung bekommt
 * nie die Prüferrolle und kann daher nie freigeben (FR-BES-06, FR-KI-09).
 */
export const katalogPruefen = (speicher: PruefungSpeicher) =>
  definiereOperation({
    name: "katalog.pruefen",
    schema: pruefSchema,
    berechtigt: istPruefer(speicher),
    ausfuehren: async (kontext, eingabe) => {
      if (eingabe.status === "zurueckgewiesen" && eingabe.grund === null) {
        return fehlgeschlagen(fehler("pruefung.grund_fehlt"));
      }
      const vorgang = await speicher.finde(kontext.nutzerId, eingabe.id);
      if (!vorgang) return fehlgeschlagen(fehler("pruefung.nicht_gefunden"));
      if (!OFFEN.includes(vorgang.status)) {
        return fehlgeschlagen(fehler("pruefung.status_unzulaessig"));
      }
      const neu = await speicher.entscheide(
        kontext.nutzerId,
        eingabe.id,
        eingabe.status,
        eingabe.grund,
      );
      return neu ? ok(neu) : fehlgeschlagen(fehler("pruefung.nicht_gefunden"));
    },
  });

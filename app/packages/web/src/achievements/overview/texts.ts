// German texts of the achievements (UI language rule), by the stable keys of the definitions (DM-ACH-01).
export const ACHIEVEMENT_NAMES: Record<string, string> = {
  "first-measurement-photo": "Erste Messung mit Foto",
  "cutting-rooted": "Steckling bewurzelt",
  "treatment-completed": "Behandlung abgeschlossen",
  "through-dormancy": "Eine Ruhephase gemeinsam überstanden",
  "healthy-for-a-year": "Ein Jahr gesund",
  "first-handover": "Erste Übergabe",
};

export const GROUP_TITLES: Record<string, string> = {
  care: "Pflege",
  growth: "Wachstum",
  swapping: "Tauschen",
  collecting: "Sammeln",
};

/** The one action that would fulfil an open achievement (P-09); the specimen name is added where one is meant. */
export function nextStepText(key: string, specimenName: string | null): string {
  switch (key) {
    case "first-measurement-photo.next":
      return "Miss ein Exemplar und füge der Messung ein Foto hinzu.";
    case "cutting-rooted.next":
      return "Topfe einen Steckling in einen eigenen Topf um, sobald er Wurzeln hat.";
    case "treatment-completed.next":
      return specimenName
        ? `Hake das letzte offene Datum der Kur bei ${specimenName} ab.`
        : "Schließe eine Kur ab: Hake alle ihre Termine ab.";
    case "through-dormancy.next":
      return "Pflege ein Exemplar durch eine ganze Ruhephase, vom Beginn bis zum Ende.";
    case "healthy-for-a-year.next":
      return "Miss ein Exemplar mindestens vier Mal über zwölf Monate und bewerte jede Messung mit „Gesund“.";
    case "first-handover.next":
      return "Tausche oder verschenke ein Exemplar an einen Freund; beide bestätigen die Übergabe.";
    default:
      return "Dieser Erfolg hat noch keine Beschreibung.";
  }
}

/** What data is missing for an open achievement: a gap, never a failure (P-08). */
export const MISSING_TEXTS: Record<string, string> = {
  no_measurements: "Es gibt noch keine Messung.",
  no_photo: "Es gibt Messungen, aber noch keine mit Foto.",
  too_few_measurements:
    "Es sind noch nicht genug Messungen da (mindestens vier an einem Exemplar).",
  no_treatment: "Es gibt noch keine Kur.",
  no_catch_date: "Bei keinem Exemplar ist ein Fangdatum bekannt.",
  no_dormancy_period: "Für keines deiner Exemplare ist eine Ruhephase bekannt.",
};

/** `2026-07-02` becomes `02.07.2026`: pure text, no time zone is involved (NFR-08). */
export const germanDate = (date: string): string => date.split("-").reverse().join(".");

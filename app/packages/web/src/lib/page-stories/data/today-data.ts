// Fixture data of "Heute" (US-QS-14): the list "Jetzt dran", open treatments and hints about incomplete plants.
type Row = Record<string, unknown>;

const item = (id: string, name: string, extra: Row) => ({
  id,
  specimenId: `s-${id}`,
  specimenName: name,
  ...extra,
});

const treatment = (id: string, name: string, extra: Row) => ({
  id,
  specimenId: `s-${id}`,
  specimenName: name,
  agent: null,
  dueAt: "2026-10-06",
  ...extra,
});

export const todayRoutes = {
  "/today": {
    date: "2026-10-08",
    upcoming: 2,
    items: [
      item("a", "Aloe", {
        kind: "treatment_overdue",
        text: "„Aloe“: Läuse – überfällig seit 2 Tagen.",
        nextAction: "Hake den Termin ab.",
        target: "treatments",
      }),
      item("b", "Monstera", {
        kind: "treatment_due",
        text: "„Monstera“: Dünger – heute fällig.",
        nextAction: "Hake den Termin ab.",
        target: "treatments",
      }),
      item("c", "Bogenhanf", {
        kind: "specimen_incomplete",
        text: "„Bogenhanf“ hat noch keinen Standort.",
        nextAction: "Weise dem Exemplar einen Standort zu.",
        target: "hints",
      }),
    ],
  },
  "/treatments": {
    treatments: [
      treatment("a", "Aloe", {
        reason: "Läuse",
        status: { kind: "overdue", text: "überfällig seit 2 Tagen" },
      }),
      treatment("b", "Monstera", {
        reason: "Dünger",
        status: { kind: "due", text: "heute fällig" },
      }),
    ],
  },
  "/specimens": {
    specimens: [
      { id: "s-a", name: "Aloe", status: "plant" },
      { id: "s-b", name: "Monstera", status: "plant" },
      { id: "s-c", name: "Bogenhanf", status: "plant" },
    ],
  },
  "/specimens/hints": {
    hints: [
      {
        kind: "location_missing",
        specimenId: "s-c",
        specimenName: "Bogenhanf",
        locationId: null,
        text: "„Bogenhanf“ hat noch keinen Standort.",
        nextAction: "Weise dem Exemplar einen Standort zu.",
      },
    ],
  },
  "/locations": { locations: [{ id: "l1", name: "Fensterbank Süd", lightZoneId: null }] },
};

/** Nothing is due: the list "Jetzt dran" says so and offers the way to the collection (P-09). */
export const todayEmpty = {
  ...todayRoutes,
  "/today": { date: "2026-10-08", upcoming: 0, items: [] },
  "/treatments": { treatments: [] },
  "/specimens/hints": { hints: [] },
};

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
        nextAction: "Weise der Pflanze einen Standort zu.",
        target: "hints",
      }),
      item("d", "Efeu", {
        kind: "phase_deviation",
        text: "„Efeu“ steht nicht am Soll-Standort.",
        nextAction: "Stelle es um.",
        target: "care_phases",
      }),
      item("e", "Farn", {
        kind: "measurement_etiolated",
        text: "„Farn“: Die letzte Messung ist vergeilt/dünn.",
        nextAction: "Stelle die Pflanze heller.",
        target: "measurements",
      }),
      item("f", "Zeder", {
        kind: "specimen_incomplete",
        text: "„Zeder“ hat noch keine Lichtzone.",
        nextAction: "Weise eine Lichtzone zu.",
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
  // The planning layer reads the plants with their location (US-BEH-01).
  "/specimens/cards": {
    cards: [
      { id: "s-a", name: "Aloe", location: "Fensterbank" },
      { id: "s-b", name: "Monstera", location: "Wohnzimmer" },
      { id: "s-c", name: "Bogenhanf", location: null },
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
        nextAction: "Weise der Pflanze einen Standort zu.",
      },
    ],
  },
  "/locations": { locations: [{ id: "l1", name: "Fensterbank Süd", lightZoneId: null }] },
  "/watering/due": {
    due: [
      {
        specimenId: "s1",
        name: "Aloe",
        intervalDays: 7,
        lastWateredOn: "2026-09-30",
        daysSince: 8,
      },
      { specimenId: "s3", name: "Efeu", intervalDays: 5, lastWateredOn: null, daysSince: 0 },
    ],
  },
};

/** Nothing is due: the list "Jetzt dran" says so and offers the way to the collection (P-09). */
export const todayEmpty = {
  ...todayRoutes,
  "/today": { date: "2026-10-08", upcoming: 0, items: [] },
  "/treatments": { treatments: [] },
  "/specimens/hints": { hints: [] },
};

/** A care phase deviation is the most urgent item: the treatments stay a tile next to the others (US-QS-18). */
export const todayPhaseFirst = {
  ...todayRoutes,
  "/today": {
    ...todayRoutes["/today"],
    items: [todayRoutes["/today"].items[3], ...todayRoutes["/today"].items.slice(0, 3)],
  },
};

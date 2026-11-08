import type { Page } from "@playwright/test";

// The answers of the overview of "Heute" for the layout tests (US-QS-18, issue 1662): the day's list, the counts of the
// three categories, the onboarding answers and one anniversary. The layout depends on the items and their counts only,
// so the fixture gives the same layout on every run. Every other request, and every write, goes to the real API.
const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;

type Text = { kind: string; text: string; nextAction: string; target: string };

/** One item of the day's list, with the texts and the action the app shows for its kind. */
const item = (id: string, name: string, what: Text) => ({
  id,
  specimenId: `s-${id}`,
  specimenName: name,
  ...what,
});
const phase = (id: string, name: string) =>
  item(id, name, {
    kind: "phase_deviation",
    text: `„${name}“ steht nicht am Soll-Standort.`,
    nextAction: "Stelle es um.",
    target: "care_phases",
  });
const etiolated = (id: string, name: string) =>
  item(id, name, {
    kind: "measurement_etiolated",
    text: `„${name}“: Die letzte Messung ist vergeilt/dünn.`,
    nextAction: "Stelle die Pflanze heller.",
    target: "measurements",
  });
const missing = (id: string, name: string) =>
  item(id, name, {
    kind: "specimen_incomplete",
    text: `„${name}“ hat noch keinen Standort.`,
    nextAction: "Weise der Pflanze einen Standort zu.",
    target: "hints",
  });
const due = (id: string, name: string, kind: string, text: string) =>
  item(id, name, { kind, text, nextAction: "Hake den Termin ab.", target: "treatments" });
const open = (
  id: string,
  name: string,
  reason: string,
  status: { kind: string; text: string },
) => ({
  id,
  specimenId: `s-${id}`,
  specimenName: name,
  agent: null,
  dueAt: "2026-10-06",
  reason,
  status,
});

/** The reads of the overview by path. The day's list starts with a care phase deviation, so the treatments stay a tile. */
const OVERVIEW: Record<string, unknown> = {
  "/today": {
    date: "2026-10-08",
    upcoming: 3,
    items: [
      phase("d", "Efeu"),
      due("a", "Aloe", "treatment_overdue", "„Aloe“: Läuse – überfällig seit 2 Tagen."),
      due("b", "Monstera", "treatment_due", "„Monstera“: Dünger – heute fällig."),
      missing("c", "Bogenhanf"),
      etiolated("e", "Farn"),
      missing("f", "Zeder"),
      phase("g", "Palme"),
      etiolated("h", "Kakteen"),
    ],
  },
  "/treatments": {
    treatments: [
      open("a", "Aloe", "Läuse", { kind: "overdue", text: "überfällig seit 2 Tagen" }),
      open("b", "Monstera", "Dünger", { kind: "due", text: "heute fällig" }),
    ],
  },
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
  "/specimens/count": { count: 3, archived: 0 },
  "/onboarding/hints": { hint: null, guideEnded: true },
  "/achievements/anniversaries": {
    calmMode: false,
    items: [
      {
        specimenId: "s-a",
        name: "Aloe",
        months: 12,
        date: "2026-10-08",
        caughtOn: "2025-10-08",
        first: null,
        latest: null,
      },
    ],
  },
};

/** Answers the overview's reads from the fixture; a write and every other request go to the real API. */
export async function answerOverview(page: Page): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    const body = OVERVIEW[new URL(route.request().url()).pathname];
    if (route.request().method() !== "GET" || body === undefined) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": WEB },
      body: JSON.stringify(body),
    });
  });
}

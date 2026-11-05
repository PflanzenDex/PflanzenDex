import { expect, showLocations, test } from "../../support/fixtures";
import {
  chooseByArrows,
  keyboardWalk,
  openByKeyboard,
  press,
  signInByKeyboard,
  specimenByKeyboard,
  tabTo,
  typeInto,
} from "../../support/keyboard";
import type { Page } from "@playwright/test";
import { VIEWS, openView } from "../../support/display/display";

// US-QS-08 Operable by keyboard alone: keyboard-only variants of the everyday flows (US-QS-07) and a keyboard walk
// over every view of the navigation, on the phone and on desktop. No step clicks or taps.

/** The management of locations and light zones, below the plants of the Sammlung (US-QS-14). */
async function locationsByKeyboard(page: Page): Promise<void> {
  await openByKeyboard(page, "Sammlung");
  await press(page, page.getByRole("button", { name: "Ansicht" }));
  await press(page, page.getByRole("button", { name: "Standorte und Lichtzonen verwalten" }));
  await expect(
    page.getByRole("heading", { level: 1, name: /Standorte und Lichtzonen/ }),
  ).toBeVisible();
}

test.describe("US-QS-08 Operable by keyboard alone", () => {
  test("US-QS-08 the first Tab shows the skip link, Enter moves the focus past the navigation (2.4.1)", async ({
    page,
    account,
  }) => {
    await signInByKeyboard(page, account);
    // A freshly loaded view: the first Tab starts at the top of the page.
    await openView(page, "/light");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox())?.width ?? 0).toBeGreaterThan(40);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.keyboard.press("Tab");
    const inMain = await page.evaluate(
      () => document.querySelector("main")?.contains(document.activeElement) ?? false,
    );
    expect(inMain).toBe(true);
  });

  test("US-QS-08 every view is reachable by keyboard, has no trap and never hides the focus (2.1.1, 2.1.2, 2.4.11)", async ({
    page,
    account,
  }) => {
    test.setTimeout(240_000);
    await signInByKeyboard(page, account);
    for (const view of VIEWS) {
      await openView(page, view);
      const steps = await keyboardWalk(page);
      const hidden = steps.filter((s) => s.hidden).map((s) => s.name);
      expect(hidden, `${view}: focus hidden behind a sticky part`).toEqual([]);
      const unmarked = steps.filter((s) => !s.indicator).map((s) => s.name);
      expect(unmarked, `${view}: focus without a visible indicator`).toEqual([]);
    }
  });

  test("US-QS-08 the Mehr drawer and Esc: the focus can always leave an overlay (2.1.2, DS-40)", async ({
    page,
    account,
  }) => {
    await signInByKeyboard(page, account);
    const more = page
      .getByRole("navigation", { name: "Navigation unten" })
      .getByRole("button", { name: "Mehr" });
    test.skip(!(await more.isVisible()), "the bottom bar exists below md only");
    await press(page, more);
    await expect(page.getByRole("dialog", { name: "Mehr" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(more).toBeFocused();
  });
});

test.describe("US-QS-08 keyboard-only everyday flows: light and measuring", () => {
  test("US-QS-08 keyboard only: set up light zones and a location (US-LIC-05)", async ({
    page,
    account,
  }) => {
    await signInByKeyboard(page, account);
    await locationsByKeyboard(page);
    await press(page, page.getByRole("button", { name: "Standard-Zonen übernehmen" }));
    await expect(page.getByRole("heading", { level: 3, name: "Zone 2" })).toBeVisible();
    await showLocations(page);
    await press(page, page.getByRole("button", { name: "Neuer Standort" }));
    const form = page.getByRole("form", { name: "Standort anlegen" });
    await typeInto(page, form.getByLabel("Name"), "Fensterbank");
    await chooseByArrows(page, form.getByLabel("Lichtzone"), 2);
    await press(page, form.getByRole("button", { name: "Standort anlegen" }));
    await expect(page.getByRole("heading", { level: 3, name: "Fensterbank" })).toBeVisible();
  });

  test("US-QS-08 keyboard only: record a measurement (US-WAC-01)", async ({ page, account }) => {
    test.setTimeout(120_000);
    await signInByKeyboard(page, account);
    await specimenByKeyboard(page, "Echeveria elegans");
    await press(page, page.getByRole("list", { name: "Pflanzen" }).getByRole("button").first());
    await press(page, page.getByRole("button", { name: /^Messen: / }));
    await expect(page.getByRole("heading", { level: 1, name: /^Messen: / })).toBeVisible();
    const form = page.getByRole("form", { name: "Messung erfassen" });
    await typeInto(page, form.getByLabel(/^Messwert/), "12,5");
    // "Messung speichern" sits in the sticky footer beside the form, outside its element (US-QS-15).
    await press(page, page.getByRole("button", { name: "Messung speichern" }));
    // Value and unit are joined by a non-breaking space (US-QS-24); `\s` matches it.
    await expect(page.getByText(/^Gespeichert: 12,5\scm am \d\d\.\d\d\.\d{4}\.$/)).toBeVisible();
    // The course with the new measurement is the layer "Verlauf" of the measure page (US-QS-15).
    await press(page, page.getByRole("button", { name: /^Verlauf \(\d+\)$/ }));
    await expect(page.getByRole("heading", { level: 3, name: /^12,5\scm · / })).toBeVisible();
  });
});

test.describe("US-QS-08 keyboard-only everyday flows: treatment and location", () => {
  test("US-QS-08 keyboard only: plan a treatment and tick it off (US-BEH-01, US-BEH-02)", async ({
    page,
    account,
  }) => {
    test.setTimeout(120_000);
    await signInByKeyboard(page, account);
    await specimenByKeyboard(page, "Aloe polyphylla");
    await openByKeyboard(page, "Heute");
    // The treatments are a layer above the overview of "Heute" (US-QS-18): the one "Behandlungen" entry (tile or row action), named by its count and topic, opens it.
    await press(
      page,
      page.getByRole("button", { name: /^(\d+ Behandlungen|Behandlungen \d+.*)$/ }),
    );
    await press(page, page.getByRole("button", { name: "Behandlung planen" }).first());
    const plan = page.getByRole("form", { name: /Behandlung planen/ });
    await press(page, plan.getByRole("checkbox").first(), "Space");
    await expect(plan.getByRole("checkbox").first()).toBeChecked();
    // The reason sits in the part "Termin" of the plan; "Pflanzen" is the other part (US-BEH-01).
    await press(
      page,
      plan
        .getByRole("group", { name: "Teile der Behandlung" })
        .getByRole("button", { name: "Termin" }),
    );
    await typeInto(page, plan.getByLabel(/^Grund/), "Wollläuse");
    // The save button is the layer's one primary action in its footer, outside the form element (US-QS-21).
    await press(page, page.getByRole("button", { name: "Behandlung speichern" }));
    const done = page.getByRole("button", { name: /^Wollläuse bei .* als erledigt abhaken$/ });
    await press(page, done);
    await expect(page.getByText(/„Wollläuse“ als erledigt eingetragen am/)).toBeVisible();
  });

  test("US-QS-08 keyboard only: confirm the location of a specimen (US-PHA-03)", async ({
    page,
    account,
  }) => {
    test.setTimeout(120_000);
    await signInByKeyboard(page, account);
    await locationsByKeyboard(page);
    await showLocations(page);
    await press(page, page.getByRole("button", { name: "Neuer Standort" }));
    const form = page.getByRole("form", { name: "Standort anlegen" });
    await typeInto(page, form.getByLabel("Name"), "Regal");
    await press(page, form.getByRole("button", { name: "Standort anlegen" }));
    await expect(page.getByRole("heading", { level: 3, name: "Regal" })).toBeVisible();
    await specimenByKeyboard(page, "Haworthia cooperi");
    // The hint "Standort fehlt" carries the action that sets the location (US-PHA-03).
    await openByKeyboard(page, "Heute");
    // The hints are a layer above the overview of "Heute" (US-QS-18): the tile, named by its count and topic, opens it.
    await press(page, page.getByRole("button", { name: /Fehlt noch$/ }));
    const select = page.getByLabel(/^Standort für „/);
    await chooseByArrows(page, select, 1);
    await press(page, page.getByRole("button", { name: /^Standort setzen: / }));
    await expect(page.getByText(/steht jetzt am Standort „Regal“/)).toBeVisible();
  });
});

test.describe("US-QS-08 focus order", () => {
  test("US-QS-08 Shift+Tab walks back in the reverse order (2.4.3)", async ({ page, account }) => {
    await signInByKeyboard(page, account);
    await locationsByKeyboard(page);
    const first = page.getByRole("button", { name: "Standard-Zonen übernehmen" });
    await tabTo(page, first);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
  });
});

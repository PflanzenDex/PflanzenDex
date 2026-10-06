import { expect, test } from "../support/fixtures";
import {
  chooseByArrows,
  keyboardWalk,
  openByKeyboard,
  press,
  signInByKeyboard,
  tabTo,
  typeInto,
} from "../support/keyboard";
import type { Page } from "@playwright/test";

// US-QS-08 Operable by keyboard alone: keyboard-only variants of the everyday flows (US-QS-07) and a keyboard walk
// over every view of the navigation, on the phone and on desktop. No step clicks or taps.

const VIEWS: { label: string; heading: RegExp }[] = [
  { label: "Start", heading: /^Start$/ },
  { label: "Arten", heading: /^Art wählen$/ },
  { label: "Bestand", heading: /^Bestand$/ },
  { label: "Behandlung", heading: /^Behandlung$/ },
  { label: "Hinweise", heading: /Hinweise/ },
  { label: "Pflegephasen", heading: /^Pflegephasen$/ },
  { label: "Pflegeprofil", heading: /Pflegeprofil/ },
  { label: "Artenvergleich", heading: /Artenvergleich|Schwierigkeit/ },
  { label: "Pokédex", heading: /Pokédex/ },
  { label: "Wunschliste", heading: /Wunschliste/ },
  { label: "Standorte und Licht", heading: /Standorte und Lichtzonen/ },
  { label: "Konto", heading: /^Hallo, / },
  { label: "Einstellungen", heading: /Einstellungen/ },
];

/** Proposes a species and creates a specimen of it, keyboard only (the start of every care flow). */
async function specimenByKeyboard(page: Page, species: string): Promise<void> {
  await openByKeyboard(page, "Arten");
  await press(page, page.getByRole("button", { name: /Art vorschlagen/ }).first());
  const form = page.getByRole("form", { name: "Art vorschlagen" });
  await typeInto(page, form.getByLabel("Lateinischer Name *"), species);
  await chooseByArrows(page, form.getByLabel("Schwierigkeit *"), 1);
  await chooseByArrows(page, form.getByLabel("Standard-Stufe (Lichtzone) *"), 3);
  await typeInto(page, form.getByLabel(/Lichtbedarf/), "40000");
  await chooseByArrows(page, form.getByLabel("Wachstumsmaß *"), 1);
  await typeInto(page, form.getByLabel("Vergeilung-Anzeichen *"), "Die Rosette streckt sich.");
  await typeInto(page, form.getByLabel("Erfolgskriterien *"), "Dichte, flache Rosette.");
  await press(page, form.getByRole("button", { name: "Vorschlag speichern" }));
  await press(page, page.getByRole("button", { name: "Diese Art wählen" }));
  const create = page.getByRole("form", { name: "Exemplar anlegen" });
  await press(page, create.getByRole("button", { name: "Exemplar anlegen" }));
  await expect(page.getByRole("heading", { level: 1, name: "Bestand" })).toBeVisible();
}

test.describe("US-QS-08 Operable by keyboard alone", () => {
  test("US-QS-08 the first Tab shows the skip link, Enter moves the focus past the navigation (2.4.1)", async ({
    page,
    account,
  }) => {
    await signInByKeyboard(page, account);
    await page
      .locator("body")
      .evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
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
      await openByKeyboard(page, view.label);
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const steps = await keyboardWalk(page);
      const hidden = steps.filter((s) => s.hidden).map((s) => s.name);
      expect(hidden, `${view.label}: focus hidden behind a sticky part`).toEqual([]);
      const unmarked = steps.filter((s) => !s.indicator).map((s) => s.name);
      expect(unmarked, `${view.label}: focus without a visible indicator`).toEqual([]);
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
    await openByKeyboard(page, "Standorte und Licht");
    await press(page, page.getByRole("button", { name: "Standard-Lampen übernehmen" }));
    await expect(page.getByRole("heading", { level: 3, name: "Lampe 2" })).toBeVisible();
    await press(page, page.locator("summary", { hasText: "Neuer Standort" }));
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
    await press(page, page.getByRole("button", { name: /^Messen: / }));
    await expect(page.getByRole("heading", { level: 1, name: /^Messen: / })).toBeVisible();
    const form = page.getByRole("form", { name: "Messung erfassen" });
    await typeInto(page, form.getByLabel(/^Messwert/), "12,5");
    await press(page, form.getByRole("button", { name: "Messung speichern" }));
    await expect(page.getByText(/^Gespeichert: 12,5 cm am \d\d\.\d\d\.\d{4}\.$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: /^12,5 cm · / })).toBeVisible();
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
    await openByKeyboard(page, "Behandlung");
    const plan = page.getByRole("form", { name: /Behandlung planen/ });
    await press(page, plan.getByRole("checkbox").first(), "Space");
    await expect(plan.getByRole("checkbox").first()).toBeChecked();
    await typeInto(page, plan.getByLabel(/^Grund/), "Wollläuse");
    await press(page, plan.getByRole("button", { name: /planen|speichern/i }));
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
    await openByKeyboard(page, "Standorte und Licht");
    await press(page, page.locator("summary", { hasText: "Neuer Standort" }));
    const form = page.getByRole("form", { name: "Standort anlegen" });
    await typeInto(page, form.getByLabel("Name"), "Regal");
    await press(page, form.getByRole("button", { name: "Standort anlegen" }));
    await expect(page.getByRole("heading", { level: 3, name: "Regal" })).toBeVisible();
    await specimenByKeyboard(page, "Haworthia cooperi");
    const select = page.getByLabel(/^Standort für „/);
    await chooseByArrows(page, select, 1);
    await press(page, page.getByRole("button", { name: /^Standort setzen: / }));
    await expect(page.getByText(/steht jetzt am Standort „Regal“/)).toBeVisible();
  });
});

test.describe("US-QS-08 focus order", () => {
  test("US-QS-08 Shift+Tab walks back in the reverse order (2.4.3)", async ({ page, account }) => {
    await signInByKeyboard(page, account);
    await openByKeyboard(page, "Standorte und Licht");
    const first = page.getByRole("button", { name: "Standard-Lampen übernehmen" });
    await tabTo(page, first);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(first).toBeFocused();
  });
});

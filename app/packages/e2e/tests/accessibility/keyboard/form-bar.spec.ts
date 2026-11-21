import type { Page } from "@playwright/test";
import {
  createLocation,
  expect,
  expectAnnounced,
  layerOf,
  openFirstPlant,
  proposeSpecies,
  signIn,
  test,
  uniqueLatin,
} from "../../../support/fixtures";
import {
  PHONES,
  SCHEMES,
  TEXT_SIZES,
  WIDE_WINDOWS,
  expectBarUsable,
  expectKeyboardCase,
  expectNoSidewaysScroll,
  setLook,
  textSizeBeforeLoad,
} from "./form-bar.checks";
import { expectBarAfterFields, expectNoControlCovered } from "./form-bar.covered";

// US-QS-32 (issue 1861, FX-36 step 2): the actions of a form or a sheet sit in its bar (SG-SHEET-04): "Abbrechen" at the
// leading edge, the confirming action at the trailing edge, and no sticky footer covers a control of the form (issues 1941,
// 1895). On the phones of the design review (393, 424 and 430 px), at 100 % and 200 % text, in light and dark, the forms
// "Messen", "Neues Gerät", "Pflegeprofil" and the settings sheet "Profil" show the bar's action, nothing fixed or sticky lies
// on a control, and with the keyboard's height taken from the window the action and the focused field stay apart. From 768 px
// (owner decision d-060) the pair is a plain row after the last field, in the dialog, the pane and the page "Messen".

type Form = { name: string; open: (page: Page) => Promise<void> };

/** The plant of a species of its own, as the other e2e flows create it. */
async function startWithPlant(page: Page): Promise<void> {
  await proposeSpecies(page, uniqueLatin("Echeveria"));
  await page
    .getByRole("form", { name: "Pflanze anlegen" })
    .getByRole("button", { name: "Pflanze anlegen" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
  await expectAnnounced(page, "ist angelegt");
}

/** Every phone, text size and scheme: opens the form, and runs the checks of the bar on it. */
async function checkForm(page: Page, form: Form): Promise<void> {
  for (const phone of PHONES) {
    for (const text of TEXT_SIZES) {
      for (const scheme of SCHEMES) {
        const what = `${form.name}, ${phone.width} px, ${text} % text, ${scheme}`;
        await setLook(page, { ...phone, text, scheme });
        await form.open(page);
        await expectBarUsable(page, what);
        await expectNoSidewaysScroll(page, what);
        // Controls are scrolled to the middle one by one: the bar must hold its place and stay usable afterwards.
        await expectNoControlCovered(page, what);
        await expectBarUsable(page, `${what}, scrolled`);
        await expectKeyboardCase(page, phone, what);
      }
    }
  }
}

/** The forms of a plant: the measure page and the care profile layer, opened from the plant's own address. */
function plantForms(plant: string): Form[] {
  return [
    {
      name: "Messen",
      open: async (p) => {
        await p.goto(plant);
        await expect(p.getByRole("tab", { name: "Überblick", selected: true })).toBeVisible();
        await p.getByRole("button", { name: /^Messen: / }).click();
        await expect(
          p.getByRole("heading", { level: 1, name: "Messen", exact: true }),
        ).toBeVisible();
      },
    },
    {
      name: "Pflegeprofil",
      open: async (p) => {
        await p.goto(plant);
        await p.getByRole("tab", { name: "Pflege" }).click();
        await p
          .getByRole("group", { name: "Teile der Pflege" })
          .getByRole("button", { name: "Pflegeprofil" })
          .click();
        await p.getByRole("button", { name: "Pflegeprofil bearbeiten" }).click();
        await expect(p.getByRole("dialog", { name: "Pflegeprofil" })).toBeVisible();
      },
    },
  ];
}

/** The forms in a layer: "Neues Gerät" and the settings group "Profil" (a sheet on a phone, a dialog from 768 px, a pane from 1024 px). */
function layerForms(): Form[] {
  return [
    {
      name: "Neues Gerät",
      open: async (p) => {
        await p.goto("/collection?view=equipment&sheet=new");
        await expect(layerOf(p, "Neues Gerät")).toBeVisible();
      },
    },
    {
      name: "Profil",
      open: async (p) => {
        await p.goto("/account/settings?sheet=profile");
        await expect(layerOf(p, "Profil")).toBeVisible();
      },
    },
  ];
}

/** A phone rule: below 768 px the pair is in the bar of the sheet or at the top of the page form. */
function skipUnlessPhone(project: string): void {
  test.skip(
    project !== "mobil",
    "a phone rule: the desktop project has the dialog, the pane and the row",
  );
}

/** A rule from md (owner decision d-060): the pair is a plain row after the last field. */
function skipUnlessDesktop(project: string): void {
  test.skip(project !== "desktop", "a rule from md: the phone project has the bar of the sheet");
}

/** Every window from md and text size: opens the form, and checks that the pair is a plain row after its last field. */
async function checkRowAfterFields(page: Page, form: Form): Promise<void> {
  for (const window of WIDE_WINDOWS) {
    for (const text of TEXT_SIZES) {
      const what = `${form.name}, ${window.width} px, ${text} % text`;
      await setLook(page, { ...window, text, scheme: "light" });
      await form.open(page);
      await expectBarAfterFields(page, what);
      await expectNoSidewaysScroll(page, what);
      await expectNoControlCovered(page, what);
    }
  }
}

test.describe("US-QS-32 the bar of a form on a phone (SG-SHEET-04, SG-FORM-02)", () => {
  test("US-QS-32 the sheets 'Neues Gerät' and 'Profil' show 'Sichern' in the bar and nothing covers a control", async ({
    page,
    account,
  }, info) => {
    skipUnlessPhone(info.project.name);
    test.setTimeout(480_000);
    await textSizeBeforeLoad(page);
    await signIn(page, account);
    for (const form of layerForms()) await checkForm(page, form);
  });

  test("US-QS-32 'Messen' and 'Pflegeprofil' show 'Sichern' in the bar and nothing covers a control", async ({
    page,
    account,
  }, info) => {
    skipUnlessPhone(info.project.name);
    test.setTimeout(600_000);
    await textSizeBeforeLoad(page);
    await signIn(page, account);
    // Without a location the care profile shows a hint and no field; with one it shows the pickers of its phases.
    await createLocation(page, "Fensterbank");
    await startWithPlant(page);
    await openFirstPlant(page);
    const plant = page.url();
    const forms = plantForms(plant);
    for (const form of forms) await checkForm(page, form);
  });
});

test.describe("US-QS-32 from 768 px the form actions sit at the end of the form (owner decision d-060, SG-SHEET-04)", () => {
  test("US-QS-32 · d-060 the dialog or pane 'Neues Gerät' and 'Profil' end with the pair as a plain row, nothing sticky", async ({
    page,
    account,
  }, info) => {
    skipUnlessDesktop(info.project.name);
    test.setTimeout(300_000);
    await textSizeBeforeLoad(page);
    await signIn(page, account);
    for (const form of layerForms()) await checkRowAfterFields(page, form);
  });

  test("US-QS-32 · d-060 the page 'Messen' ends with the pair as a plain row, one pair at a time, nothing sticky", async ({
    page,
    account,
  }, info) => {
    skipUnlessDesktop(info.project.name);
    test.setTimeout(300_000);
    await textSizeBeforeLoad(page);
    await signIn(page, account);
    await startWithPlant(page);
    await openFirstPlant(page);
    const [measure] = plantForms(page.url());
    if (measure) await checkRowAfterFields(page, measure);
  });
});

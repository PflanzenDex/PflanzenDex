import type { Page } from "@playwright/test";
import {
  TEXT_SPACING_CSS,
  VIEWS,
  brokenWords,
  layoutProblems,
  openView,
  signInToApp,
  tooltips,
} from "../../../support/display/display";
import { addLocation, expect, listRow, test } from "../../../support/fixtures";
import { specimenByKeyboard } from "../../../support/keyboard";

// US-QS-12: enlarge and adapt the display without losing content. Every view of a fresh account is measured in the
// real browser; the standing criteria hold for every view added to VIEWS later (FR-QG-10 item 11).

/** Gives the account light zones and a location with a long name, so lists and cards are measured, not only empty states. */
async function withSomeData(page: Page): Promise<void> {
  await openView(page, "/light");
  await page.getByRole("button", { name: "Standard-Zonen übernehmen" }).click();
  // The zones are paged by the free height (US-QS-19): on a short window the first page may end before Zone 2, so the
  // check names the first zone, which is always on the first page.
  await expect(listRow(page, "Zone 1")).toBeVisible();
  await addLocation(page);
  const form = page.getByRole("form", { name: "Standort anlegen" });
  await form.getByLabel("Name").fill("Fensterbank im Schlafzimmer nach Südsüdwest");
  await form.getByLabel("Lichtzone").selectOption({ label: "Zone 3" });
  await page.locator("[data-form-bar]").getByText("Standort anlegen").click();
  await expect(listRow(page, "Fensterbank im Schlafzimmer")).toBeVisible();
}

/** Opens every view and collects its layout problems, after an optional preparation (for example a stylesheet). */
async function problemsInEveryView(page: Page, prepare?: () => Promise<unknown>) {
  const found: Record<string, string[]> = {};
  for (const view of VIEWS) {
    await openView(page, view);
    if (prepare) await prepare();
    const problems = await layoutProblems(page);
    if (problems.length > 0) found[view] = problems;
  }
  return found;
}

// Every test opens all views, the orientation test twice: more than the default minute.
test.describe.configure({ timeout: 180_000 });

test.describe("US-QS-12 adaptable display: reflow, zoom and orientation", () => {
  test("US-QS-12 every view works at 320 CSS px without sideways scrolling or cut-off content (1.4.10)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "mobil", "phone width; the desktop project checks 400 % zoom");
    await page.setViewportSize({ width: 320, height: 640 });
    await signInToApp(page, account);
    await withSomeData(page);
    expect(await problemsInEveryView(page)).toEqual({});
  });

  test("US-QS-12 every view works at 400 % zoom of a 1280 px window (1.4.4, 1.4.10)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "desktop", "zoom is a desktop browser setting");
    // 400 % of a 1280 × 1024 window leaves 320 × 256 CSS px: the same layout the browser zoom produces.
    await page.setViewportSize({ width: 320, height: 256 });
    await signInToApp(page, account);
    await withSomeData(page);
    expect(await problemsInEveryView(page)).toEqual({});
  });

  test("US-QS-12 every view works in portrait and in landscape, nothing locks the orientation (1.3.4)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "mobil", "orientation is a phone setting");
    await signInToApp(page, account);
    await withSomeData(page);
    await page.setViewportSize({ width: 412, height: 915 });
    expect(await problemsInEveryView(page)).toEqual({});
    await page.setViewportSize({ width: 915, height: 412 });
    expect(await problemsInEveryView(page)).toEqual({});
    const link = page.locator("link[rel='manifest']");
    const manifest = (await link.count()) > 0 ? await link.getAttribute("href") : null;
    if (manifest) {
      const body = (await (await page.request.get(manifest)).json()) as { orientation?: string };
      expect(body.orientation ?? "any").toBe("any");
    }
  });

  test("US-QS-12 user text spacing neither overlaps nor cuts off text in any view (1.4.12)", async ({
    page,
    account,
  }) => {
    await signInToApp(page, account);
    await withSomeData(page);
    const spacing = () => page.addStyleTag({ content: TEXT_SPACING_CSS });
    expect(await problemsInEveryView(page, spacing)).toEqual({});
  });

  test("US-QS-12 no view shows content on hover or focus that cannot be dismissed (1.4.13)", async ({
    page,
    account,
  }) => {
    // No view uses tooltips today. A future tooltip must close on Esc, stay while hovered and not time out;
    // this test then gets replaced by one that checks exactly that.
    await signInToApp(page, account);
    await withSomeData(page);
    for (const view of VIEWS) {
      await openView(page, view);
      expect(await tooltips(page), view).toEqual([]);
    }
  });
});

/**
 * The first plant of the Sammlung gets a last measurement with the quality "Vergeilt/dünn", so its tile shows the state that
 * needs attention (US-QS-32). The Sammlung is shown again afterwards.
 */
async function etiolatedMeasurement(page: Page): Promise<void> {
  await page.getByRole("list", { name: "Pflanzen" }).getByRole("button").first().click();
  await page.getByRole("button", { name: /^Messen: / }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messen", exact: true })).toBeVisible();
  const form = page.getByRole("form", { name: "Messung erfassen" });
  await form.getByLabel(/^Messwert/).fill("12,5");
  await form.getByLabel("Qualität").selectOption("etiolated");
  await page.getByRole("button", { name: "Messung sichern" }).click();
  // The form clears once the measurement is stored; the saved result is not waited for here (a growth note takes the
  // one polite region after a save, see the measure spec).
  await expect(form.getByLabel(/^Messwert/)).toHaveValue("");
  await page.getByRole("link", { name: "Sammlung", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sammlung" })).toBeVisible();
}

// FR-BES-23 (issue 1414): the tile of a plant in the Sammlung at 360 px and 200 % text. At that width the picture and the
// text stack (`@max-[7.5rem]` in plant-tile.tsx), so the state keeps the full width of the tile. Without the stacking the
// picture and the text share one row, the text column gets no room and the state mark is cut off. Nothing overflows the
// window then, so the one-screen metrics stay green (they never see it). 200 % text is set the way the one-screen gate
// sets it (`html { font-size: 200% }`).
test.describe("FR-BES-23 Sammlung tiles at 200 % text", () => {
  test("FR-BES-23 the state of a tile stays visible inside its tile at 360 px and 200 % text", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: the desktop project is not sized for 360 px",
    );
    test.setTimeout(120_000);
    await signInToApp(page, account);
    await specimenByKeyboard(page, "Aloe vera");
    await etiolatedMeasurement(page);

    await page.setViewportSize({ width: 360, height: 640 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    const tile = page.getByRole("list", { name: "Pflanzen" }).getByRole("button").first();
    await expect(tile).toBeVisible();
    // The state leads the meta line of the row (US-QS-32, #2266); a plant without an attention state shows none.
    const state = tile.getByText("Vergeilt/dünn", { exact: true });
    await expect(state).toBeVisible();

    // The state lies inside the tile, left and right: its word is not cut off by the edge of the tile.
    const tileBox = await tile.boundingBox();
    const stateBox = await state.boundingBox();
    if (!tileBox || !stateBox) throw new Error("the tile or its state has no box");
    expect(stateBox.x).toBeGreaterThanOrEqual(tileBox.x);
    expect(stateBox.x + stateBox.width).toBeLessThanOrEqual(tileBox.x + tileBox.width);
  });
});

/** The words of the page title in the top bar that break inside the word (see `brokenWords`). */
async function brokenTitleWords(page: Page): Promise<string[]> {
  return brokenWords(page.locator("[data-app-bar-slot] h1"));
}

// US-QS-32 (issue 2231): at 200 % text a bar title never breaks inside a word, an action wraps under it instead. The h1
// hyphenation (issue 1315) once lowered the title's minimum to a syllable: "Samm-lung" with "Ansicht" beside it.
test.describe("US-QS-32 bar titles at 200 % text", () => {
  for (const view of ["/collection", "/friends/exchange", "/friends/match"]) {
    test(`US-QS-32 the bar title of ${view} keeps every word whole at 360 to 412 px and 200 % text (issue 2231)`, async ({
      page,
      account,
    }, info) => {
      test.skip(info.project.name !== "mobil", "the top bar shows below md, a phone width");
      await signInToApp(page, account);
      await openView(page, view);
      // A fresh account has the exchange locked (US-ONB-05): unlock it, so the page and its bar title show.
      const unlock = page.getByRole("button", { name: "Jetzt freischalten" });
      if (await unlock.isVisible()) await unlock.click();
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expect(page.locator("[data-app-bar-slot] h1")).toBeVisible();
      // The break showed from 393 px (iPhone 16), where a syllable and the action fit one row and the word did not.
      for (const width of [360, 393, 412]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await brokenTitleWords(page), `${view} at ${width} px`).toEqual([]);
      }
    });
  }
});

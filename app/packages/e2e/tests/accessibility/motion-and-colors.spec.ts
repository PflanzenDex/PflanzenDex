import type { Page } from "@playwright/test";
import {
  VIEWS,
  controlsWithoutBoundary,
  focusIndicator,
  openView,
  signInToApp,
  unreadableStatusTexts,
} from "../../support/display";
import { expect, test } from "../../support/fixtures";

// US-QS-12: the system settings "reduce motion", forced colors (Windows contrast themes) and the dark scheme.

/** Running animations and transitions longer than a blink (10 ms). */
async function longAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .map((a) => ({ a, ms: Number(a.effect?.getComputedTiming().duration ?? 0) }))
      .filter(({ ms }) => ms > 10)
      .map(({ a, ms }) => `${a.constructor.name} ${ms} ms`),
  );
}

/** Tabs through the first stops of the view and returns those without a visible focus indicator. */
async function stopsWithoutFocusIndicator(page: Page, needRing: boolean): Promise<string[]> {
  const missing: string[] = [];
  for (let stop = 0; stop < 12; stop += 1) {
    await page.keyboard.press("Tab");
    const focus = await focusIndicator(page);
    if (!focus) break;
    const ring = needRing && focus.ring !== "none";
    if (focus.outline === "none" && !ring) missing.push(focus.element);
  }
  return missing;
}

test.describe("US-QS-12 adaptable display: reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("US-QS-12 with reduced motion the menu sheet and the controls do not animate (2.3.3, DS-19)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "mobil", "the sheet with more destinations exists below md");
    await signInToApp(page, account);
    await openView(page, "/");
    await page.getByRole("button", { name: "Mehr" }).click();
    await expect(page.getByRole("dialog", { name: "Mehr" })).toBeVisible();
    expect(await longAnimations(page)).toEqual([]);
    const link = page.getByRole("dialog", { name: "Mehr" }).getByRole("link").first();
    expect(await link.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(
      /^0s$|^0\.0+\d*s$|^1e-0\ds$/,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Mehr" })).toHaveCount(0);
  });
});

test.describe("US-QS-12 adaptable display: forced colors", () => {
  test.use({ forcedColors: "active" });

  test("US-QS-12 in forced colors focus indicator, control borders and status texts stay visible (1.4.11, 2.4.7)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "desktop", "Windows contrast themes are a desktop setting");
    await signInToApp(page, account);
    for (const view of VIEWS) {
      await openView(page, view);
      // Box shadows (the focus ring) are dropped in forced colors, so the outline must carry the focus.
      expect(await stopsWithoutFocusIndicator(page, false), view).toEqual([]);
      expect(await controlsWithoutBoundary(page), view).toEqual([]);
      expect(await unreadableStatusTexts(page), view).toEqual([]);
    }
  });
});

test.describe("US-QS-12 adaptable display: dark scheme", () => {
  test.use({ colorScheme: "dark" });

  test("US-QS-12 in the dark scheme focus indicator and status texts stay visible (1.4.11, 2.4.7)", async ({
    page,
    account,
  }) => {
    // The contrast of ring, field boundary and texts in dark is computed by style-contrast.test.ts (DS-20).
    await signInToApp(page, account);
    for (const view of VIEWS) {
      await openView(page, view);
      expect(await stopsWithoutFocusIndicator(page, true), view).toEqual([]);
      expect(await unreadableStatusTexts(page), view).toEqual([]);
    }
  });
});

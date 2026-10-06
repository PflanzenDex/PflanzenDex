import type { Page } from "@playwright/test";
import {
  TEXT_SPACING_CSS,
  VIEWS,
  layoutProblems,
  openView,
  signInToApp,
  tooltips,
} from "../../support/display";
import { expect, test } from "../../support/fixtures";

// US-QS-12: enlarge and adapt the display without losing content. Every view of a fresh account is measured in the
// real browser; the standing criteria hold for every view added to VIEWS later (FR-QG-10 item 11).

/** Gives the account light zones and a location with a long name, so lists and cards are measured, not only empty states. */
async function withSomeData(page: Page): Promise<void> {
  await openView(page, "/light");
  await page.getByRole("button", { name: "Standard-Lampen übernehmen" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Lampe 2" })).toBeVisible();
  await page.getByText("Neuer Standort").click();
  const form = page.getByRole("form", { name: "Standort anlegen" });
  await form.getByLabel("Name").fill("Fensterbank im Schlafzimmer nach Südsüdwest");
  await form.getByLabel("Lichtzone").selectOption({ label: "Lampe 3" });
  await form.getByRole("button", { name: "Standort anlegen" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: /Fensterbank im Schlafzimmer/ }),
  ).toBeVisible();
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

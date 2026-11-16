import type { Locator, Page } from "@playwright/test";
import { brokenWords, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-32 (issue 2245, issue 2249): the labels of the bottom bar keep every word whole. A label wraps at spaces to at most two
// lines, and a word too wide for its slot shrinks (SG-NAV-07), never below 12 px. At a large text size "Entdecken" moves into
// "Mehr" (issue 2249). The tests sit here, not in reflow.spec.ts (the display folder is full and that file is capped at 200 lines).

/** The visible words of the bar's slots; a locked destination's screen-reader span and the hidden layout's slots are not among them. */
const VISIBLE = "nav[data-bottom-bar] span.block:visible";

/** The font size, the lines and the fit of a visible label in its slot (SG-NAV-07). */
async function metricsOf(label: Locator) {
  return label.evaluate((el) => {
    const slot = el.closest("nav[data-bottom-bar] > *") ?? el;
    const word = el.getBoundingClientRect();
    const box = slot.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    return {
      font: parseFloat(getComputedStyle(el).fontSize),
      lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
      overflow: el.scrollWidth - el.clientWidth,
      outside: word.left < box.left - 1 || word.right > box.right + 1,
    };
  });
}

/** One visible label: whole words, inside its slot, at most `maxLines` lines and never below 12 px (SG-NAV-07, issue 2249). */
async function expectWholeLabel(label: Locator, where: string, maxLines: number): Promise<void> {
  expect(await brokenWords(label), where).toEqual([]);
  const m = await metricsOf(label);
  expect(m.overflow, `${where}: sideways overflow`).toBeLessThanOrEqual(1);
  expect(m.outside, `${where}: box outside its slot`).toBe(false);
  expect(m.lines, `${where}: lines`).toBeLessThanOrEqual(maxLines);
  expect(m.font, `${where}: font size (12 px floor)`).toBeGreaterThanOrEqual(11.99);
}

/** Every visible label of the bar at each phone width, at one text size (SG-NAV-07, issue 2245). */
async function expectWidths(page: Page, labels: Locator, percent: number): Promise<void> {
  for (const width of [360, 393, 412, 430]) {
    await page.setViewportSize({ width, height: 800 });
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const label = labels.nth(i);
      await expectWholeLabel(
        label,
        `${(await label.textContent()) ?? "?"} at ${width} px and ${percent} % text`,
        2,
      );
    }
  }
}

/** The root font size doubles, as the browser's text setting does: the bar measures its text size in rem. */
async function setText(page: Page, percent: number): Promise<void> {
  await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` });
}

test("US-QS-32 the bottom bar labels keep every word whole and inside their slot at 360 to 430 px, 100 % and 200 % text (issue 2245)", async ({
  page,
  account,
}, info) => {
  test.skip(info.project.name !== "mobil", "the bottom bar shows below md, a phone width");
  test.setTimeout(120_000);
  await signInToApp(page, account);
  const labels = page.locator(VISIBLE);
  await expect(labels.first()).toBeVisible();
  // The default bar holds the longest labels, so the words checked here are the widest ones.
  expect(await labels.allTextContents()).toEqual(expect.arrayContaining(["Entdecken", "Sammlung"]));
  await expectWidths(page, labels, 100);
  await setText(page, 200);
  await expectWidths(page, labels, 200);
});

test("US-QS-32 at a large text size Entdecken moves into Mehr: Mehr is the last slot, its drawer names Entdecken in full, every label is one line (issue 2249)", async ({
  page,
  account,
}, info) => {
  test.skip(info.project.name !== "mobil", "the bottom bar shows below md, a phone width");
  test.setTimeout(120_000);
  await signInToApp(page, account);
  await setText(page, 200);
  const bar = page.getByRole("navigation", { name: "Navigation unten" });
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(bar.getByRole("link", { name: "Entdecken" })).toHaveCount(0);
    const labels = page.locator(VISIBLE);
    expect(await labels.allTextContents(), `${width} px`).toEqual([
      "Heute",
      "Sammlung",
      "Freunde",
      "Konto",
      "Mehr",
    ]);
    for (let i = 0; i < 5; i++)
      await expectWholeLabel(labels.nth(i), `slot ${i} at ${width} px`, 1);
    await bar.getByRole("button", { name: "Mehr" }).click();
    const dialog = page.getByRole("dialog", { name: "Mehr" });
    await expect(dialog.getByRole("link", { name: "Entdecken", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("US-QS-32 the start bar has the height of the shell's bar at 100 % and 200 % text, from the labels the shell stored (issue 2230, issue 2249)", async ({
  page,
  account,
}, info) => {
  test.skip(info.project.name !== "mobil", "the bottom bar shows below md, a phone width");
  test.setTimeout(120_000);
  // Signing in makes the shell store its bar's slots on this device; the start frame draws them.
  await signInToApp(page, account);
  await page.setViewportSize({ width: 360, height: 800 });
  // The shell's module waits for `hold` while the start frame stands (SG-STATE-02); one route serves every load.
  let hold: Promise<void> = Promise.resolve();
  await page.route(/app-shell/, async (route) => {
    await hold;
    await route.continue();
  });
  for (const percent of [100, 200]) {
    let release = (): void => undefined;
    hold = new Promise<void>((resolve) => (release = resolve));
    await page.goto("/collection");
    await setText(page, percent);
    const start = page.locator("[data-start-bar]");
    await expect(start).toBeAttached();
    const startHeight = await start.evaluate((el) => el.getBoundingClientRect().height);
    release();
    const real = page.locator("nav[data-bottom-bar]");
    await expect(real).toBeVisible();
    const realHeight = await real.evaluate((el) => el.getBoundingClientRect().height);
    expect(
      Math.abs(startHeight - realHeight),
      `${percent} % text: start ${startHeight}, bar ${realHeight}`,
    ).toBeLessThan(0.5);
  }
});

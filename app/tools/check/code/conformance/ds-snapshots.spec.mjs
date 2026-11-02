// Screenshots of the catalog (QG-U5). Runs inside the container.
//  - ui stories (US-QS-07): one full-page picture per story, light and dark, 360 px.
//  - page states (FR-QG-27): five viewport pictures per page state and scheme at the US-QS-15 sizes.
// Env: DS_BASE_URL (catalog server), DS_STORIES / DS_PAGES (JSON arrays of story ids), DS_QUARANTINE (JSON array of
// page picture names that are skipped), DS_STORY_ARGS (optional story args, only used by the self-test).
import { expect, test } from "@playwright/test";
import { storyUrl } from "./conformance-probes.mjs";
import { baselineName, pageBaselineName, PAGE_SIZES, SCHEMES } from "./ds-snapshots.lib.mjs";

const ids = JSON.parse(process.env.DS_STORIES ?? "[]");
const pageIds = JSON.parse(process.env.DS_PAGES ?? "[]");
const quarantined = new Set(JSON.parse(process.env.DS_QUARANTINE ?? "[]"));
const extra = process.env.DS_STORY_ARGS ? `&args=${process.env.DS_STORY_ARGS}` : "";

// Two frames pass (layout after a resize or a colour scheme change), fonts are loaded, then the DOM stays quiet for
// 250 ms: stories that set their state right after mount (an error message, an open overlay) must have finished
// rendering before the picture is taken.
async function settle(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    await document.fonts.ready;
    await new Promise((resolve) => {
      let timer;
      const done = () => {
        observer.disconnect();
        resolve();
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(done, 250);
      };
      const observer = new MutationObserver(arm);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      arm();
    });
  });
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
}

async function openStory(page, id, scheme) {
  await page.goto(storyUrl(process.env.DS_BASE_URL, id, scheme) + extra);
  await page.waitForSelector("body.sb-show-main, body.sb-show-errordisplay", { state: "attached" });
  expect(await page.locator("body.sb-show-errordisplay").count(), "story failed to render").toBe(0);
  await settle(page);
}

for (const scheme of SCHEMES) {
  for (const id of ids) {
    test(`QG-U5 · US-QS-07 · ${id} (${scheme}) matches its baseline`, async ({ page }) => {
      await openStory(page, id, scheme);
      await expect(page).toHaveScreenshot(["ui", baselineName(id, scheme)], { fullPage: true });
    });
  }
  for (const id of pageIds) {
    test(`QG-U5 · FR-QG-27 · ${id} (${scheme}) matches its baselines at every size`, async ({
      page,
    }) => {
      await openStory(page, id, scheme);
      for (const size of PAGE_SIZES) {
        const name = pageBaselineName(id, size, scheme);
        if (quarantined.has(name)) continue;
        await page.setViewportSize(size);
        await settle(page);
        await expect.soft(page).toHaveScreenshot(["pages", name]);
      }
    });
  }
}

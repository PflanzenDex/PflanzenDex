// One screenshot per ui story, light and dark, 360 px (QG-U5, US-QS-07). Runs inside the container.
// Env: DS_BASE_URL (catalog server), DS_STORIES (JSON array of story ids), DS_STORY_ARGS (optional story args,
// only used by the self-test to change a fixture's padding).
import { expect, test } from "@playwright/test";
import { storyUrl } from "./conformance-probes.mjs";
import { baselineName, SCHEMES } from "./ds-snapshots.lib.mjs";

const ids = JSON.parse(process.env.DS_STORIES ?? "[]");
const extra = process.env.DS_STORY_ARGS ? `&args=${process.env.DS_STORY_ARGS}` : "";

for (const scheme of SCHEMES) {
  for (const id of ids) {
    test(`QG-U5 · US-QS-07 · ${id} (${scheme}) matches its baseline`, async ({ page }) => {
      await page.goto(storyUrl(process.env.DS_BASE_URL, id, scheme) + extra);
      await page.waitForSelector("body.sb-show-main, body.sb-show-errordisplay", {
        state: "attached",
      });
      expect(
        await page.locator("body.sb-show-errordisplay").count(),
        "story failed to render",
      ).toBe(0);
      // Fonts loaded, then the DOM quiet for 250 ms: stories that set their state right after mount (an error
      // message, an open overlay) must have finished rendering before the picture is taken.
      await page.evaluate(async () => {
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
      await expect(page).toHaveScreenshot(baselineName(id, scheme), { fullPage: true });
    });
  }
}

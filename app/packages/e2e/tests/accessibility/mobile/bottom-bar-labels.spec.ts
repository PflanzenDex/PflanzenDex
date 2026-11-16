import { brokenWords, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-32 (issue 2245): the labels of the bottom bar keep every word whole. A label wraps at spaces to at most two lines,
// and a word too wide for its slot shrinks (SG-NAV-07), so "Entdecken" never breaks as "Entdec/ken" at 200 % text. The
// test sits here, not in reflow.spec.ts (the display folder is full and that file is capped at 200 lines).
test.describe("US-QS-32 bottom bar labels at 100 % and 200 % text", () => {
  test("US-QS-32 the bottom bar labels keep every word whole and inside their slot at 360 to 430 px, 100 % and 200 % text (issue 2245)", async ({
    page,
    account,
  }, info) => {
    test.skip(info.project.name !== "mobil", "the bottom bar shows below md, a phone width");
    test.setTimeout(120_000);
    await signInToApp(page, account);
    // The visible word of each slot; a locked destination has a second, screen-reader-only span that this selector skips.
    const labels = page.locator("nav[data-bottom-bar] span.block");
    await expect(labels.first()).toBeVisible();
    // The default bar holds the longest labels, so the words checked here are the widest ones.
    expect(await labels.allTextContents()).toEqual(
      expect.arrayContaining(["Entdecken", "Sammlung"]),
    );
    for (const percent of [100, 200]) {
      if (percent === 200) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      }
      for (const width of [360, 393, 412, 430]) {
        await page.setViewportSize({ width, height: 800 });
        const count = await labels.count();
        for (let i = 0; i < count; i++) {
          const label = labels.nth(i);
          const where = `${(await label.textContent()) ?? "?"} at ${width} px and ${percent} % text`;
          expect(await brokenWords(label), where).toEqual([]);
          const metrics = await label.evaluate((el) => {
            const slot = el.closest("nav[data-bottom-bar] > *") ?? el;
            const word = el.getBoundingClientRect();
            const box = slot.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(el);
            return {
              overflow: el.scrollWidth - el.clientWidth,
              outside: word.left < box.left - 1 || word.right > box.right + 1,
              lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
            };
          });
          expect(metrics.overflow, `${where}: sideways overflow`).toBeLessThanOrEqual(1);
          expect(metrics.outside, `${where}: box outside its slot`).toBe(false);
          expect(metrics.lines, `${where}: lines`).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

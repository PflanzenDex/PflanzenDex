import type { Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";

// Where the quick actions of the plant layer stand (US-QS-15, SG-FEED-05, issues 2536 and 2535), for everyday-flows.spec.ts: the
// result of "Gießen" moves nothing of them, so the spec compares their places before and after the press.

/** What the result of "Gießen" moves nothing of: the scroll position and the quick-action buttons (SG-FEED-05, issue 2536). */
export const placesOf = (page: Page) =>
  page.getByRole("group", { name: "Schnellaktionen" }).evaluate((row) => {
    const region = row.closest("[data-layer-body]")?.querySelector("[data-scroll-region]");
    const box = (e: Element) => `${e.textContent}@${JSON.stringify(e.getBoundingClientRect())}`;
    return [region?.scrollTop, ...[...row.querySelectorAll("button")].map(box)];
  });

/**
 * The places of the quick actions once the layer has come up and holds still. The layer slides in for about 320 ms from below
 * the window, so a read taken on the way (the row at 728 px, outside a window of 640 px) is no place to compare with (issue 2535).
 */
export async function settledPlaces(page: Page): Promise<unknown[]> {
  const row = page.getByRole("group", { name: "Schnellaktionen" });
  const window = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => (await row.boundingBox())?.y ?? Number.POSITIVE_INFINITY, {
      message: "the quick actions come inside the window",
    })
    .toBeLessThan(window);
  let last = "";
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await placesOf(page));
        const same = now === last;
        last = now;
        return same;
      },
      { message: "the quick actions hold their place" },
    )
    .toBe(true);
  return placesOf(page);
}

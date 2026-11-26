import { openView, signInToApp } from "../../../support/display/display";
import { test } from "../../../support/fixtures";
import {
  SHEET,
  expectRowsAndRecommendationsApart,
  routeNeeds,
  textAt200,
} from "./needs-sheet-checks";

// US-QS-32 (issues 2272, 2280 and 2535): the "Bedarf" sheet at 200 % text (SG-TOUCH-01, SG-LIST-03, QG-U8). The list of the needs
// is the plain content of its layer, which scrolls: no pager (owner decision 2026-11-23, issue 2418). Every need is a row, the rows
// keep the height of their content, and the recommendations start right below the last row and never lie under it. The checks are
// in needs-sheet-checks.ts.

test.describe("US-QS-32 the Bedarf sheet at 200 % text (issue 2272)", () => {
  test("US-QS-32 the Bedarf sheet on a phone at 200 % text: every need is a row that keeps its height, and the recommendations start below the last row with no pager (issues 2272, 2280, 2535)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: from 1024 px the sheet is a pane, the desktop project checks that",
    );
    await routeNeeds(page);
    await signInToApp(page, account);
    await textAt200(page);
    for (const [width, height] of [
      [360, 640],
      [412, 915],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openView(page, SHEET);
      await expectRowsAndRecommendationsApart(page, `${width}x${height} at 200 %`);
    }
  });

  test("US-QS-32 the Bedarf pane from 1024 px at 200 % text: every need is a row that keeps its height, and the recommendations start below the last row with no pager (issues 2272, 2280, 2535)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "the pane of a layer from 1024 px: the desktop project checks it, the phone project the sheet",
    );
    await routeNeeds(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInToApp(page, account);
    await textAt200(page);
    await openView(page, SHEET);
    await expectRowsAndRecommendationsApart(page, "1280x800 at 200 %");
  });
});

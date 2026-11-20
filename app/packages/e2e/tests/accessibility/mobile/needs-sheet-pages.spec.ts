import { openView, signInToApp } from "../../../support/display/display";
import { test } from "../../../support/fixtures";
import { SHEET, expectEveryPage, routeNeeds, textAt200 } from "./needs-sheet-checks";

// US-QS-32 (issue 2280): the "Bedarf" sheet at 200 % text on every page of the needs. On a phone the pager starts at most one
// pager gap below the last row: the list is as tall as its rows, not as tall as the tallest row of the needs, so no blank band
// lies between them. The checks of each page are in needs-sheet-checks.ts (the rows, the pager and the recommendations, issue
// 2272). Page 1 alone is checked by needs-sheet.spec.ts.

test.describe("US-QS-32 the Bedarf sheet at 200 % text on every page (issue 2280)", () => {
  test("US-QS-32 · issue 2280 the Bedarf sheet on a phone at 200 % text: on every page the pager starts at most one pager gap below the last row, and the rows and the pager stay apart", async ({
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
      await expectEveryPage(page, `${width}x${height} at 200 %`, true);
    }
  });

  test("US-QS-32 · issue 2280 the Bedarf pane from 1024 px at 200 % text: on every page the rows and the pager stay apart and the recommendations below the pager", async ({
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
    await expectEveryPage(page, "1280x800 at 200 %", false);
  });
});

import { openView, signInToApp } from "../../../support/display/display";
import { test } from "../../../support/fixtures";
import { SHEET, expectRowsAndPagerApart, routeNeeds, textAt200 } from "./needs-sheet-checks";

// US-QS-32 (issue 2272): the "Bedarf" sheet at 200 % text (SG-TOUCH-01, SG-LIST-03, QG-U8). Its rows keep the height of their
// content, and the pager and the recommendations below never cover the rows or each other. The checks are in
// needs-sheet-checks.ts; the pages of the sheet are checked by needs-sheet-pages.spec.ts (issue 2280).

test.describe("US-QS-32 the Bedarf sheet at 200 % text (issue 2272)", () => {
  test("US-QS-32 the Bedarf sheet on a phone at 200 % text: rows keep their height, the pager is below them and the recommendations below the pager (issue 2272)", async ({
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
      await expectRowsAndPagerApart(page, `${width}x${height} at 200 %`, false);
    }
  });

  test("US-QS-32 the Bedarf pane from 1024 px at 200 % text: rows keep their height, the pager is below them and the recommendations below the pager (issue 2272)", async ({
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
    await expectRowsAndPagerApart(page, "1280x800 at 200 %", false);
  });
});

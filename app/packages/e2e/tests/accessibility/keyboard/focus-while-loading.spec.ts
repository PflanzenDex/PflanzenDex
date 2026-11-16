import { expect, test } from "../../../support/fixtures";
import { signInByKeyboard, tabTo } from "../../../support/keyboard";

// US-QS-08: what loads after the person has started with the keyboard must not take the focus away.

test.describe("US-QS-08 focus while a view loads", () => {
  test("US-QS-08 the first-plant step appearing late leaves the focus where the person put it (2.4.3, issue 1362)", async ({
    page,
    account,
  }) => {
    // The step shows once the count of the plants has arrived: hold it back, so the Tab comes first.
    await page.route(/\/specimens\/count/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });
    await signInByKeyboard(page, account);
    // The first control of the page stands on every width: the brand leaves the top bar while a page claims it (US-QS-32).
    const skip = page.getByRole("link", { name: "Zum Inhalt springen" });
    await tabTo(page, skip);
    await expect(
      page.getByRole("heading", { level: 2, name: "Deine erste Pflanze" }),
    ).toBeVisible();
    await expect(skip).toBeFocused();
  });
});

import { expect, signIn, test } from "../../../support/fixtures";
import { press } from "../../../support/keyboard";
import { openView } from "../../../support/display/display";

// US-QS-08 (issue 1573): in a real browser, Escape in the shortcut overview returns the focus to what opened it. The
// phone opens the overview as a sheet and the desktop as a dialog; both projects run these tests.

test.describe("US-QS-08 the shortcut overview returns the focus (DS-40)", () => {
  test("US-QS-08 opened from its button by a click, Escape returns the focus to the button", async ({
    page,
    account,
  }) => {
    await signIn(page, account);
    await openView(page, "/account/functions");
    const help = page.getByRole("button", { name: "Tastenkürzel anzeigen" });
    await help.click();
    await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(help).toBeFocused();
  });

  test("US-QS-08 opened from its button by Tab and Enter, Escape returns the focus to the button", async ({
    page,
    account,
  }) => {
    await signIn(page, account);
    await openView(page, "/account/functions");
    const help = page.getByRole("button", { name: "Tastenkürzel anzeigen" });
    await press(page, help);
    await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(help).toBeFocused();
  });

  test("US-QS-08 opened with ?, Escape moves the focus to the heading of the view, not to body", async ({
    page,
    account,
  }) => {
    await signIn(page, account);
    await openView(page, "/today");
    // With no control focused, the overview has no opener and returns the focus to the start of the view.
    await page
      .locator("body")
      .evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeFocused();
  });
});

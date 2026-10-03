import { axeReport } from "../support/axe";
import { signIn, expect, test } from "../support/fixtures";

// Care phases (US-PHA-01), signed in, against the real API and database. The flow with a specimen of a species with a
// dormancy period needs the species catalog build-up (BES-01, open) and is pending; the phase derivation is covered by
// `packages/api/src/care/care-phases.test.ts` against the real database.
test.describe("US-PHA-01 Pflegephasen", () => {
  test("US-PHA-01 a new account sees the empty state with next action (P-09)", async ({
    page,
    account,
  }, info) => {
    await signIn(page, account);
    await page.getByRole("button", { name: "Pflegephasen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pflegephasen" })).toBeVisible();
    await expect(
      page.getByText("Lege im Bestand ein Exemplar einer solchen Art an."),
    ).toBeVisible();
    await axeReport(page, info, "carePhases-empty");
  });
});

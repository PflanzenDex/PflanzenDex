import { axeBericht } from "../support/axe";
import { anmelden, expect, test } from "../support/fixtures";

// Pflegephasen (US-PHA-01), angemeldet, gegen echte API und Datenbank. Der Ablauf mit einem Exemplar einer Art mit
// Ruhephasen-Zeitraum braucht den Artenkatalog-Aufbau (BES-01, offen) und steht aus; die Phasenableitung deckt
// `packages/api/src/pflege/pflegephasen.test.ts` gegen die echte Datenbank ab.
test.describe("US-PHA-01 Pflegephasen", () => {
  test("US-PHA-01 neues Konto sieht den Leerzustand mit nächster Handlung (P-09)", async ({
    page,
    konto,
  }, info) => {
    await anmelden(page, konto);
    await page.getByRole("button", { name: "Pflegephasen" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Pflegephasen" })).toBeVisible();
    await expect(
      page.getByText("Lege im Bestand ein Exemplar einer solchen Art an."),
    ).toBeVisible();
    await axeBericht(page, info, "pflegephasen-leer");
  });
});

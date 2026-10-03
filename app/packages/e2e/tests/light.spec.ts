import { axeReport } from "../support/axe";
import { signInAtLight, expect, test } from "../support/fixtures";

// Core flow R1: set up locations and light zones (US-LIC-05), signed in, against the real API and database.
test.describe("US-LIC-05 locations and light zones", () => {
  test("US-LIC-05 new account sees the empty state with the next action (P-09)", async ({
    page,
    account,
  }, info) => {
    await signInAtLight(page, account);
    await expect(page.getByText("Noch keine Lichtzonen.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Standard-Lampen übernehmen" })).toBeVisible();
    await expect(page.getByText("Noch keine Standorte.")).toBeVisible();
    await axeReport(page, info, "light-empty");
  });

  test("US-LIC-05 adopt default lamps, create location and assign light zone", async ({
    page,
    account,
  }, info) => {
    await signInAtLight(page, account);
    await page.getByRole("button", { name: "Standard-Lampen übernehmen" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Lampe 2" })).toBeVisible();
    await expect(page.getByText("bis 15.000 Lux")).toBeVisible();

    await page.getByText("Neuer Standort").click();
    const form = page.getByRole("form", { name: "Standort anlegen" });
    await form.getByLabel("Name").fill("Balkon");
    await form.getByLabel("Lichtzone").selectOption({ label: "Lampe 3" });
    await form.getByLabel("Art").selectOption("outdoor");
    await form.getByRole("button", { name: "Standort anlegen" }).click();

    await expect(page.getByRole("heading", { level: 3, name: "Balkon" })).toBeVisible();
    await expect(page.getByText("Lampe 3 · außen")).toBeVisible();
    await axeReport(page, info, "light-eingerichtet");

    // Nothing is lost silently (P-10): after reloading the data from the database is there again.
    await page.reload();
    await page.getByRole("button", { name: "Standorte und Licht" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Balkon" })).toBeVisible();
  });

  test("US-LIC-05 location without light zone appears in the hints with the next action", async ({
    page,
    account,
  }) => {
    await signInAtLight(page, account);
    await page.getByText("Neuer Standort").click();
    const form = page.getByRole("form", { name: "Standort anlegen" });
    await form.getByLabel("Name").fill("Regal");
    await form.getByRole("button", { name: "Standort anlegen" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Hinweise" })).toBeVisible();
    await expect(page.getByText("Weise dem Standort eine Lichtzone zu.")).toBeVisible();
  });

  test("US-LIC-05 create own light zone", async ({ page, account }) => {
    await signInAtLight(page, account);
    const form = page.getByRole("form", { name: "Lichtzone anlegen" });
    await form.getByLabel("Name").fill("Fensterbank");
    await form.getByLabel("Lux-Decke (Lux)").fill("8000");
    await form.getByRole("button", { name: "Zone anlegen" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Fensterbank" })).toBeVisible();
    await expect(page.getByText("bis 8.000 Lux")).toBeVisible();
  });
});

test.describe("US-LIC-01 determine the zone of a species", () => {
  test("US-LIC-01 derives the zone from lux need and default level and explains the result", async ({
    page,
    account,
  }) => {
    await signInAtLight(page, account);
    await page.getByRole("button", { name: "Standard-Lampen übernehmen" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Lampe 2" })).toBeVisible();

    const form = page.getByRole("form", { name: "Zone ermitteln" });
    await form.getByLabel("Lux-Bedarf der Art (Lux)").fill("15000");
    await form.getByRole("button", { name: "Zone ermitteln" }).click();
    await expect(form.getByText("Lichtzone: Lampe 2")).toBeVisible();

    await form.getByLabel("Lux-Bedarf der Art (Lux)").fill("100000");
    await form.getByLabel("Sonnenliebende C3-Pflanze mit weichem Blatt").check();
    await form.getByRole("button", { name: "Zone ermitteln" }).click();
    await expect(form.getByText("Lichtzone: Lampe 2")).toBeVisible();
    await expect(form.getByText(/nicht automatisch in eine stärkere Zone/)).toBeVisible();

    await form.getByLabel("Sonnenliebende C3-Pflanze mit weichem Blatt").uncheck();
    await form.getByRole("button", { name: "Zone ermitteln" }).click();
    await expect(form.getByText("Lichtzone: Lampe 4")).toBeVisible();
  });
});

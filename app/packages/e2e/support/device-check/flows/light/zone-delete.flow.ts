import { boolCheck, focusCheck, liveCheck, toastCheck } from "../../check";
import { focusOf, liveTextsOf, toastCountOf } from "../../check.page";
import { defineFlow } from "../../flow";

// SG-BASE-01 (issue 2465): a deleted light zone leaves its layer and the focus lands on the view (its heading), never on the body;
// the deletion is announced (the list is the result, no toast). The zone is made in the run, so the seed stays as it is.

export default defineFlow({
  name: "zone-delete",
  title: "A deleted light zone leaves the focus on the view (SG-BASE-01, issue 2465)",
  screen: "collection-view-plants-manage-locations",
  async run(ctx) {
    const { page } = ctx;
    const name = `DC ${Date.now().toString(36).slice(-5)}`;
    await page.getByRole("button", { name: "Neue Lichtzone", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Lux-Obergrenze").fill("3000");
    await page.getByRole("button", { name: "Lichtzone anlegen", exact: true }).click();
    const row = page.getByRole("button", { name }).first();
    await row.waitFor({ timeout: 10_000 });
    await row.click();
    await page.getByRole("button", { name: "Lichtzone löschen", exact: true }).click();
    await page.getByRole("button", { name: `„${name}“ löschen` }).click();
    await page
      .getByRole("button", { name })
      .first()
      .waitFor({ state: "detached", timeout: 10_000 })
      .catch(() => undefined);
    const gone = (await page.getByRole("button", { name }).count()) === 0;
    ctx.check(boolCheck("delete: the zone leaves the list", gone, gone ? "gone" : "still listed"));
    ctx.check(focusCheck(await focusOf(page)));
    ctx.check(toastCheck(await toastCountOf(page)));
    ctx.check(liveCheck(await liveTextsOf(page), "Lichtzone gelöscht"));
  },
});

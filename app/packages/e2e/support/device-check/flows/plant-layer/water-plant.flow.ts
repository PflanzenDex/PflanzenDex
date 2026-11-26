import { settle } from "../../../display/one-screen/fit";
import { boolCheck, focusCheck, heightCheck, liveCheck, stillCheck, toastCheck } from "../../check";
import { boxesOf, focusOf, liveTextsOf, pageHeightOf, toastCountOf } from "../../check.page";
import { defineFlow } from "../../flow";

// SG-FEED-05 (issue 2462): "Gießen" in the plant layer writes its result into the line of the overview that has its place, so
// the controls around it do not move under the finger, and the result is announced (SG-FEED-04, no toast for a success).

// What the plant layer says after "Gießen" (SG-FEED-04, SG-FEED-05): "Gegossen heute" when the write made the entry (its undo row
// says it once, for 8 s), "Zuletzt gegossen: heute" when the plant was entered earlier today (the write made none). The button is
// always shown, so the flow cannot tell the two cases apart before the click: it accepts either and checks the one it got.
// "als gegossen eingetragen" is the text of the pot-label page; the plant layer does not say it.
const SAID = ["Gegossen heute", "Zuletzt gegossen: heute"] as const;

export default defineFlow({
  name: "water-plant",
  title: "Gießen in the plant layer: nothing moves (SG-FEED-05, issue 2462)",
  screen: "collection-plant-overview",
  async run(ctx) {
    const { page } = ctx;
    const water = page.getByRole("button", { name: /^Gießen: / }).first();
    const shown = await water.isVisible().catch(() => false);
    ctx.check(boolCheck("water: the Gießen button is shown", shown, shown ? "shown" : "not shown"));
    if (!shown) return;
    const others = {
      messen: page.getByRole("button", { name: /^Messen: / }),
      foto: page.getByRole("button", { name: /^Foto: / }),
      behandeln: page.getByRole("button", { name: /^Behandeln: / }),
      verlauf: page.getByRole("tab", { name: "Verlauf", exact: true }),
      pflege: page.getByRole("tab", { name: "Pflege", exact: true }),
    };
    const before = await boxesOf(others);
    const heightBefore = await pageHeightOf(page);
    await water.click();
    const said = (text: string) => page.locator("[aria-live]").filter({ hasText: text });
    await said(SAID[0])
      .or(said(SAID[1]))
      .first()
      .waitFor({ timeout: 8_000 })
      .catch(() => undefined);
    await settle(page);
    const live = await liveTextsOf(page);
    const heard = SAID.find((s) => live.some((t) => t.includes(s)));
    ctx.check(stillCheck(before, await boxesOf(others)));
    ctx.check(heightCheck(heightBefore, await pageHeightOf(page)));
    ctx.check(focusCheck(await focusOf(page)));
    ctx.check(toastCheck(await toastCountOf(page)));
    ctx.check(liveCheck(live, heard ?? SAID.join('" or "')));
  },
});

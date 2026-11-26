import type { Page } from "@playwright/test";
import { settle } from "../../../display/one-screen/fit";
import { boolCheck, focusCheck, liveCheck, stillCheck, toastCheck } from "../../check";
import { boxesOf, focusOf, liveTextsOf, toastCountOf } from "../../check.page";
import { defineFlow, type FlowContext } from "../../flow";

// SG-FEED-04, SG-BASE-01 (issue 2464): a sent friend request keeps the focus in the layer, says the result and moves nothing. The
// code comes from another demo account that makes an invitation in its own browser context (the code is shown once). Only the
// accounts with the friends feature can invite (test5 and test6 have it locked), so the senders are test3 and test.

const SENDERS = ["test3", "test"] as const;
const SHORT_MS = 10_000;

/** An invitation code of another demo account, made in its own context; null when the account cannot make one. */
async function inviteCodeOf(ctx: FlowContext, account: string): Promise<string | null> {
  const state = await ctx.signedIn(account);
  if (!state) return null;
  const other = await ctx.browser.newContext({ locale: "de-DE", storageState: state });
  try {
    const page: Page = await other.newPage();
    await page.goto(`${ctx.base}/friends?sheet=add`);
    await page
      .getByRole("button", { name: "Einladungscode erzeugen" })
      .click({ timeout: SHORT_MS });
    const code = page.getByLabel("Dein Freundescode");
    await code.waitFor({ timeout: SHORT_MS });
    return (await code.textContent())?.trim() ?? null;
  } catch {
    return null;
  } finally {
    await other.close();
  }
}

/** Sends one request with `code` from the open layer. Returns whether the form says it was sent; the checks are recorded then. */
async function sendWith(ctx: FlowContext, code: string): Promise<boolean> {
  const { page } = ctx;
  await page.getByRole("tab", { name: "Code eingeben", exact: true }).click({ timeout: SHORT_MS });
  await page.getByLabel("Freundescode").fill(code);
  const send = page.getByRole("button", { name: "Anfrage senden" });
  const named = {
    einladen: page.getByRole("tab", { name: "Einladen", exact: true }),
    code: page.getByRole("tab", { name: "Code eingeben", exact: true }),
    field: page.getByLabel("Freundescode"),
    send,
  };
  const before = await boxesOf(named);
  await send.click({ timeout: SHORT_MS });
  const line = page.getByText("Anfrage gesendet").first();
  await line.waitFor({ timeout: SHORT_MS }).catch(() => undefined);
  await settle(page);
  const sent = await line.isVisible().catch(() => false);
  if (!sent) return false;
  ctx.check(boolCheck("request: the form says the request is sent", true, "shown"));
  ctx.check(focusCheck(await focusOf(page)));
  ctx.check(toastCheck(await toastCountOf(page)));
  ctx.check(liveCheck(await liveTextsOf(page), "Anfrage gesendet"));
  ctx.check(stillCheck(before, await boxesOf(named)));
  return true;
}

export default defineFlow({
  name: "friend-request",
  title:
    "A sent friend request keeps the focus and says the result (SG-FEED-04, SG-BASE-01, issue 2464)",
  screen: "friends-sheet-add",
  async run(ctx) {
    for (const sender of SENDERS) {
      const code = await inviteCodeOf(ctx, sender);
      if (code && (await sendWith(ctx, code))) return;
    }
    ctx.check(
      boolCheck(
        "request: a demo account sent the request",
        false,
        `none of ${SENDERS.join(", ")} sent one`,
      ),
    );
  },
});

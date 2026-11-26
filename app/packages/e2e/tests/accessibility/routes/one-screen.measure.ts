import type { Page } from "@playwright/test";
import { measure, settle } from "../../../support/display/one-screen/fit";
import { firstOf } from "../../../support/display/one-screen/fit.first";
import { evaluate, type Raw, type Result } from "../../../support/display/one-screen/judge";
import { type Screen } from "../../../support/display/one-screen/register";
import { sizesOf } from "../../../support/display/one-screen/register.check";

// The measure of one screen at each of its sizes (US-QS-15, QG-U8, issue 1137): its own sizes when the register names them
// (a new state runs at three sizes, issue 2431). Split from one-screen.spec.ts for its length.
export async function measureAll(page: Page, screen: Screen): Promise<Result[]> {
  const results: Result[] = [];
  for (const size of sizesOf(screen)) {
    await page.setViewportSize({ width: size.width, height: size.height });
    if (size.kind === "text200")
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await settle(page);
    const withPaint = size.kind === "cap" && !screen.capExempt;
    const first = size.kind === "cap" ? null : await firstOf(page);
    const raw: Raw = { ...(await measure(page, withPaint)), first };
    results.push(evaluate(screen.id, size, raw, Boolean(screen.sidewaysExempt)));
  }
  return results;
}

import { expect, type Page } from "@playwright/test";
import { WEB, test } from "../../../support/display/one-screen/sign-in";
import { lostScreen } from "../../../support/display/one-screen/baseline";
import { openScreen, settle } from "../../../support/display/one-screen/fit";
import { SCREENS, type Screen } from "../../../support/display/one-screen/register";
import { axeFindings } from "../../../support/display/a11y/axe-findings";
import { A11Y_SIZES, judgeResult, type Result } from "../../../support/display/a11y/findings";
import { readBaseline, saveResults } from "../../../support/display/a11y/reporter";
import { escapeWalk, keyboardWalk, skipLinkWalk } from "../../../support/display/a11y/walk/walk";

// FR-QG-24, QG-U7 (issue 467): axe and the keyboard walk over every screen of the register at phone and desktop size; the
// screen is opened once and resized, writes are aborted. `make a11y-routes`; the project "a11y-routes" is not part of
// `make e2e`. The self-test of the comparison is in a11y-routes-self-test.spec.ts.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WRITE = process.env["A11Y_ROUTES_WRITE"] === "1";

test.describe.configure({ mode: "parallel", timeout: 240_000 });

/** The skip link exists on app pages only: signed in, no click steps (those leave the focus start somewhere else). */
const checksSkipLink = (screen: Screen) => screen.account !== "anon" && !screen.steps?.length;

async function checkAll(page: Page, screen: Screen): Promise<Result[]> {
  const results: Result[] = [];
  for (const [i, size] of A11Y_SIZES.entries()) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await settle(page, 400);
    const findings = await axeFindings(page);
    if (checksSkipLink(screen)) findings.push(...(await skipLinkWalk(page)));
    findings.push(...(await keyboardWalk(page)));
    if (i === A11Y_SIZES.length - 1) findings.push(...(await escapeWalk(page)));
    results.push({ screen: screen.id, size: size.name, findings });
  }
  return results;
}

test.describe("FR-QG-24 accessibility per route (QG-U7)", () => {
  for (const screen of SCREENS) {
    test(`FR-QG-24 axe and keyboard walk: ${screen.id}`, async ({ browser, states }) => {
      const storageState = await states(screen.account);
      const context = await browser.newContext({
        locale: "de-DE",
        colorScheme: "light",
        viewport: { width: 390, height: 844 },
        ...(storageState ? { storageState } : {}),
      });
      await context.route(`${API}/**`, (route) =>
        route.request().method() === "GET" ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
      try {
        await openScreen(page, WEB, screen);
        const results = await checkAll(page, screen);
        const lost = lostScreen(WEB + screen.path, page.url());
        if (lost) throw new Error(`${screen.id}: ${lost}`);
        saveResults(screen.id, results);
        if (!WRITE) {
          const baseline = readBaseline();
          const problems = results.flatMap((r) =>
            judgeResult(r, baseline, Boolean(screen.unstable)),
          );
          expect(problems, screen.id).toEqual([]);
        }
      } finally {
        await context.close();
      }
    });
  }
});

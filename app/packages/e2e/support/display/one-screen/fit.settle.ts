import type { Page } from "@playwright/test";

// The settle before a measure (US-QG-01, issue 2429, E-30; the rule of ADR 0010): split from fit.ts to stay under the file limit.
// Called by openScreen and by the one-screen and a11y-routes specs; its browser self-test is tests/accessibility/routes/one-screen.settle.ts.

// Quiet time of the DOM before a measure: the rule of ADR 0010 (250 ms), replacing the fixed 400 ms and 900 ms pauses (issue 2429).
const QUIET_MS = 250;
// A page that never settles (a clock, a loader that keeps mutating) is measured as it is after this long, never waited for longer.
const SETTLE_CAP_MS = 4000;

/**
 * Waits until the page is ready to be measured (US-QG-01, issue 2429, E-30): the network is idle, nothing is busy, the web fonts
 * are loaded, no finite CSS animation runs (a layer slides in with a 500 ms CSS animation and no DOM change, Vaul's
 * slideFromBottom) and the DOM has been quiet for QUIET_MS. An endless animation (a spinner) is not waited for. `pause` adds a
 * fixed wait; the measures pass none (the sign-in keeps its own pause).
 */
export async function settle(page: Page, pause = 0): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => undefined);
  await page
    .waitForFunction(() => !document.querySelector("[aria-busy='true']"), null, { timeout: 5000 })
    .catch(() => undefined);
  await page
    .evaluate(
      async ({ quietMs, capMs }) => {
        await document.fonts.ready;
        const started = performance.now();
        let last = started;
        const observer = new MutationObserver(() => {
          last = performance.now();
        });
        // The root, not the body: a page can have no body (the Keycloak registration page), and observing null throws.
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        // A finite animation or transition that runs keeps the clock of the quiet time at zero.
        const finiteRunning = () =>
          document.getAnimations().some((a) => {
            if (a.playState !== "running") return false;
            const end = a.effect?.getComputedTiming().endTime;
            return typeof end === "number" && Number.isFinite(end);
          });
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            const now = performance.now();
            if (finiteRunning()) last = now;
            if (now - last >= quietMs || now - started >= capMs) {
              clearInterval(timer);
              resolve();
            }
          }, 25);
        });
        observer.disconnect();
      },
      { quietMs: QUIET_MS, capMs: SETTLE_CAP_MS },
    )
    .catch((error: Error) => {
      // A page that navigates while it settles (a redirect to the sign-in) destroys its context: the lost-screen check after the
      // settle names that page. Any other error is raised.
      if (!String(error).includes("Execution context was destroyed")) throw error;
    });
  if (pause > 0) await page.waitForTimeout(pause);
}

import { expect, test } from "@playwright/test";
import { settle } from "../../../support/display/one-screen/fit";

// Self-test of the settle before a measure (US-QG-01, issue 2429, E-30; the ADR 0010 rule): fonts loaded, no finite CSS animation
// running, the DOM quiet for 250 ms, and no fixed pause. It runs in the browser of the gate, on pages set in place (no server).
// Registered from one-screen.spec.ts; each test measures what the settle waited for, not how long it took on this machine.

/** The settle returns when the DOM and the animations are quiet, not after the old fixed 900 ms (the 500 ms network idle is kept). */
const FIXED_PAUSE_MS = 900;

test("US-QG-01 settle waits until the DOM has stopped changing, every change included", async ({
  page,
}) => {
  await page.setContent(`<div id="t">0</div><script>
    let n = 0;
    window.__last = performance.now();
    new MutationObserver(() => { window.__last = performance.now(); })
      .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const id = setInterval(() => {
      document.getElementById("t").textContent = String(++n);
      if (n >= 10) clearInterval(id);
    }, 100);
  </script>`);
  await settle(page);
  const { count, quiet } = await page.evaluate(() => ({
    count: Number(document.getElementById("t")?.textContent),
    quiet: performance.now() - (window as unknown as { __last: number }).__last,
  }));
  expect(count, "every change happened before settle returned").toBe(10);
  expect(quiet, "the DOM was quiet for the 250 ms of the settle").toBeGreaterThanOrEqual(240);
});

test("US-QG-01 settle waits for a CSS transition that changes no DOM (the Vaul layer slide)", async ({
  page,
}) => {
  // 1500 ms: the network idle of settle (about 500 ms) is over before the slide ends, so only the animation wait holds it.
  await page.setContent(`<style>
    #slide { width: 40px; height: 40px; background: red; animation: slide 1500ms linear forwards; }
    @keyframes slide { from { transform: translateX(0); } to { transform: translateX(300px); } }
  </style><div id="slide"></div>`);
  await settle(page);
  const { running, left } = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === "running").length,
    left: document.getElementById("slide")?.getBoundingClientRect().left ?? -1,
  }));
  expect(running, "no animation runs when settle returns").toBe(0);
  expect(left, "the slide ended at its last frame").toBeGreaterThanOrEqual(299);
});

test("US-QG-01 settle waits for an animation that starts after the network idle (a 900 ms delay)", async ({
  page,
}) => {
  // The slide starts after the 500 ms network idle and changes no DOM: the settle loop must poll until it has ended, not check once.
  await page.setContent(`<style>
    #late { width: 40px; height: 40px; background: red; animation: late 400ms linear 900ms both; }
    @keyframes late { from { transform: translateX(0); } to { transform: translateX(300px); } }
  </style><div id="late"></div>`);
  await settle(page);
  const { running, left } = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === "running").length,
    left: document.getElementById("late")?.getBoundingClientRect().left ?? -1,
  }));
  expect(running, "no animation runs when settle returns, the delayed one included").toBe(0);
  expect(left, "the slide ended at its last frame").toBeGreaterThanOrEqual(299);
});

test("US-QG-01 settle ends after the quiet time, not after the old fixed pause", async ({
  page,
}) => {
  await page.setContent(`<div id="a">still</div>`);
  const started = Date.now();
  await settle(page);
  const elapsed = Date.now() - started;
  expect(
    elapsed,
    `settle took ${elapsed} ms, the old fixed pause alone was ${FIXED_PAUSE_MS} ms`,
  ).toBeLessThan(1200);
});

// The shard run found it: on the Keycloak registration page `document.body` is null, and observing null threw in the settle.
test("US-QG-01 settle works on a page without a body element", async ({ page }) => {
  await page.setContent("<p>text</p>");
  await page.evaluate(() => document.body.remove());
  expect(await page.evaluate(() => document.body)).toBeNull();
  await settle(page);
});

test("US-QG-01 settle does not wait for an endless animation (a spinner)", async ({ page }) => {
  await page.setContent(`<style>
    #spin { width: 20px; height: 20px; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style><div id="spin"></div>`);
  const started = Date.now();
  await settle(page);
  expect(Date.now() - started, "an endless animation is no reason to wait").toBeLessThan(2000);
});

test("US-QG-01 settle returns with the web fonts loaded, not still loading", async ({ page }) => {
  await page.route("https://fonts.test/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "font/woff2",
      headers: { "access-control-allow-origin": "*" },
      body: Buffer.from("not a font, so the face ends in error and no longer loads"),
    });
  });
  await page.setContent(`<script>
    const face = new FontFace("Slow", "url(https://fonts.test/slow.woff2)");
    document.fonts.add(face);
    face.load().catch(() => undefined);
  </script><p style="font-family: Slow">text</p>`);
  await settle(page);
  const status = await page.evaluate(() => document.fonts.status);
  expect(status, "a font request still in flight holds the settle").not.toBe("loading");
});

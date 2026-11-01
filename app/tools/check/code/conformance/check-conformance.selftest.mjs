// Self-test of the QG-U5 conformance run (US-QS-07): it builds the catalog together with two negative
// fixture stories and proves the run fails on a 36 px target and on an unlabeled input. It needs a
// browser, so it is not part of `npm test`; `npm run conformance` runs it right after the real run.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { runConformance, settleBeforeAxe } from "./check-conformance.mjs";
import { INTERACTIVE, probeTargets, tabThrough } from "./conformance-probes.mjs";

describe("QG-U5 · conformance run catches", () => {
  const outDir = path.join(os.tmpdir(), `conformance-fixtures-${process.pid}`);
  let findings;

  it("QG-U5 · conformance run catches a 36px target and an unlabeled input in the fixture stories", async () => {
    findings = await runConformance({ outDir, fixtures: true });
    assert.ok(findings.length > 0);
  });

  it("QG-U5 · conformance run catches a 36px target, naming story and element", () => {
    const hit = findings.filter((f) => /conformance-fixture-smalltarget--default/.test(f));
    assert.ok(
      hit.some((f) => /button.*36 px.*DS-15/.test(f)),
      hit.join("\n"),
    );
  });

  it("QG-U5 · conformance run catches an unlabeled input through axe, in light and dark", () => {
    for (const scheme of ["light", "dark"]) {
      const hit = findings.filter(
        (f) =>
          f.includes(`conformance-fixture-unlabeledinput--default (${scheme})`) &&
          f.includes("axe label"),
      );
      assert.equal(hit.length, 1, `${scheme}: ${findings.join("\n")}`);
    }
  });

  it("QG-U5 · conformance run reports only the fixture stories, never the catalog", () => {
    assert.ok(
      findings.every((f) => /conformance-fixture/.test(f)),
      findings.join("\n"),
    );
  });
});

// QG-U9: the text colour changes from the light-mode to the dark-mode value through a 600 ms transition,
// like the label of the dark ui-form stories after the scheme switch. Foreground and background of `fg` are
// set per test; the page starts with the background already dark.
const transitionPage = (
  endColor,
) => `<!doctype html><html lang="en"><body style="margin:0;background:#121a14">
<main><p id="t" style="color:#1b2a1f;transition:color 600ms linear;font-size:14px">Label text</p></main>
<script>requestAnimationFrame(() => requestAnimationFrame(() => { document.getElementById("t").style.color = "${endColor}"; }));</script>
</body></html>`;

describe("QG-U9 · conformance run waits for colour transitions before axe", () => {
  let browser;
  let page;
  const contrast = async () =>
    (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze()).violations;

  before(async () => {
    browser = await chromium.launch();
  });
  after(async () => {
    await browser.close();
  });
  beforeEach(async () => {
    page = await (await browser.newContext()).newPage();
  });

  it("QG-U9 · without the wait, axe samples the half-finished transition (the flake)", async () => {
    await page.setContent(transitionPage("#e8f2ea"));
    await page.waitForFunction(() => document.getAnimations().length > 0);
    assert.ok((await contrast()).length > 0, "expected the mid-transition sample to fail");
  });

  it("QG-U9 · after the wait the transition has finished and axe sees the settled colour", async () => {
    await page.setContent(transitionPage("#e8f2ea"));
    await settleBeforeAxe(page);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.getElementById("t")).color),
      "rgb(232, 242, 234)",
    );
    assert.deepEqual(await contrast(), []);
  });

  it("QG-U9 · a real low contrast still fails after the wait", async () => {
    await page.setContent(transitionPage("#1f2d23"));
    await settleBeforeAxe(page);
    const violations = await contrast();
    assert.equal(violations.length, 1);
    assert.equal(violations[0].id, "color-contrast");
  });
});

// DS-37 (issue 1122): the focus ring fades in over 600 ms, like the ring of the app's controls. The probe must read the
// settled ring after Tab, not a frame of the transition, or the result depends on machine load.
const focusRingPage = `<!doctype html><html lang="en"><body style="margin:0">
<style>button{outline:none;box-shadow:0 0 0 0 rgb(27 107 74 / 0);transition:box-shadow 600ms linear}
button:focus-visible{box-shadow:0 0 0 4px rgb(27 107 74)}</style>
<main><button style="width:48px;height:48px">Ok</button></main></body></html>`;

describe("DS-37 · conformance run reads the settled focus ring", () => {
  it("DS-37 · after Tab the probe sees the finished ring, whatever the load", async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.setContent(focusRingPage);
      const targets = await page.evaluate(probeTargets, INTERACTIVE);
      const reached = await tabThrough(page, targets.length);
      assert.equal(reached.get(0)?.boxShadow, "rgb(27, 107, 74) 0px 0px 0px 4px");
    } finally {
      await browser.close();
    }
  });
});

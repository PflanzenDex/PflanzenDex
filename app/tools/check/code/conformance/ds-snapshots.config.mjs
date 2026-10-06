// Playwright config of the QG-U5 visual regression (US-QS-07). Runs inside the pinned Playwright container
// (see ds-snapshots.mjs), never on the host: the baselines are only valid for that image.
import { defineConfig } from "@playwright/test";
import { VIEWPORT } from "./ds-snapshots.lib.mjs";

export default defineConfig({
  testDir: ".",
  testMatch: "ds-snapshots.spec.mjs",
  snapshotPathTemplate: `${process.env.DS_SNAPSHOT_DIR}/{arg}{ext}`,
  outputDir: process.env.DS_OUTPUT_DIR,
  // No retries and no parallelism: a flaky screenshot is quarantined with an issue, never retried silently.
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Small tolerance for anti-aliasing noise: 0.1 % of the pixels. A 4 px padding change moves far more.
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
    launchOptions: {
      // The container is the sandbox; the container user is not root. Fixed rendering flags for stable text.
      args: [
        "--no-sandbox",
        "--font-render-hinting=none",
        "--disable-lcd-text",
        "--force-color-profile=srgb",
      ],
    },
  },
});

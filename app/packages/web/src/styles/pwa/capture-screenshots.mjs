// The screenshots of the install sheet (US-QS-26): the three phone screens the manifest names, rendered from the Storybook
// screen stories with fixture data, so no real user data reaches the picture (owner decision 2026-11-09). Builds the
// catalog, serves it on the host and writes `public/screenshots/*.png` at 390 x 844 px (device scale 1). Rerunning it
// replaces the files. Usage: `npm run pwa-screenshots -w @pflanzendex/web`.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../../../..");

/** The picture size of the install sheet: a phone in portrait (the manifest's `form_factor` narrow). */
export const SIZE = { width: 390, height: 844 };
/** Where the manifest's `screenshots` point: `/screenshots/<file>` in the public folder of the web app. */
const SCREENSHOT_DIR = path.join(here, "public", "screenshots");
/** The stories and their files, in the order of the manifest (US-QS-26). Story ids are Storybook's ids of the exports. */
export const SCREENSHOTS = [
  { file: "heute.png", story: "seiten-heute--phone" },
  { file: "sammlung.png", story: "seiten-sammlung--plants-phone" },
  { file: "pflanze.png", story: "seiten-sammlung--plant-layer-phone" },
];

/** Builds the catalog of the Storybook into `outDir` (the same build as `make build-storybook`). */
function buildCatalog(outDir) {
  const r = spawnSync(
    "npm",
    ["exec", "-w", "@pflanzendex/web", "--", "storybook", "build", "-o", outDir, "--quiet"],
    { cwd: appRoot, encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`storybook build failed:\n${r.stdout}\n${r.stderr}`);
}

/** A free local port: the server listens on it at once, so there is no race with another process. */
function freePort() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Serves the built catalog on a free local port with Vite's static preview (no own file code, no config file). */
async function serve(root) {
  const port = await freePort();
  const server = await preview({
    configFile: false,
    root,
    build: { outDir: root },
    preview: { host: "127.0.0.1", port, strictPort: true },
  });
  return { server, url: `http://127.0.0.1:${port}` };
}

/** Two frames pass, the fonts are there and the DOM stays quiet for 300 ms: the story has finished its state. */
async function settle(page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    await frame();
    await document.fonts.ready;
    await new Promise((resolve) => {
      let timer;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, 300);
      });
      const done = () => {
        observer.disconnect();
        resolve();
      };
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      timer = setTimeout(done, 300);
    });
  });
}

/** Renders one story at the phone size and returns its PNG. */
async function shoot(browser, base, story) {
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
  });
  try {
    const page = await context.newPage();
    await page.goto(`${base}/iframe.html?id=${story}&viewMode=story`);
    await page.waitForSelector("body.sb-show-main, body.sb-show-errordisplay", {
      state: "attached",
    });
    if ((await page.locator("body.sb-show-errordisplay").count()) > 0)
      throw new Error(`story ${story} failed to render`);
    // The screen loads its parts after the first paint; a status that still says "wird geladen" means it is not done.
    await page.waitForFunction(
      () => !/wird geladen|lädt|laden …/.test(document.body.innerText),
      null,
      { timeout: 30_000 },
    );
    await settle(page);
    return await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  } finally {
    await context.close();
  }
}

async function capture(base) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    for (const { file, story } of SCREENSHOTS) {
      const png = await shoot(browser, base, story);
      // Sharp writes the file as an optimised palette PNG, so the files stay small (the same library as build-icons).
      const { size } = await sharp(png)
        .png({ palette: true, quality: 90, effort: 10 })
        .toFile(path.join(SCREENSHOT_DIR, file));
      console.log(`pwa-screenshots: ${file} from ${story} (${size} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const work = mkdtempSync(path.join(os.tmpdir(), "pwa-screenshots-"));
  const catalog = path.join(work, "storybook");
  try {
    buildCatalog(catalog);
    const { server, url } = await serve(catalog);
    try {
      await capture(url);
    } finally {
      server.close();
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

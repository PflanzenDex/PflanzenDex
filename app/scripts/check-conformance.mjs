// Gate QG-U5 / FR-QG-09 (US-QS-07): runs every story of the component catalog in a real browser, in light and
// dark at 360 px width, and checks axe (serious/critical), 44x44 px targets (DS-15), a visible focus indicator
// on Tab (DS-37) and Esc plus focus return of overlays (DS-40). jsdom cannot measure any of this.
// Usage: node scripts/check-conformance.mjs [--report]   (--report prints the findings but exits 0)
// The catalog is built to a temporary directory and served from there; no database or API is needed.
import AxeBuilder from "@axe-core/playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { INTERACTIVE, overlayResults, probeTargets, tabThrough } from "./conformance-probes.mjs";
import {
  axeFindings,
  focusFindings,
  overlayFindings,
  parseAllowlist,
  targetFindings,
} from "./conformance-rules.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlistFile = path.join(appRoot, "conformance-allowlist.json");
const FIXTURE_PREFIX = "conformance-fixture-";
const where = ({ story, scheme }) => `QG-U5 ${story} (${scheme})`;
const SCHEMES = ["light", "dark"];
const VIEWPORT = { width: 360, height: 640 };

function serve(root) {
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(root, rel === "/" ? "index.html" : rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
}

function buildCatalog(outDir, fixtures) {
  const r = spawnSync(
    "npm",
    ["exec", "-w", "@pflanzendex/web", "--", "storybook", "build", "-o", outDir, "--quiet"],
    {
      cwd: appRoot,
      env: { ...process.env, ...(fixtures ? { CONFORMANCE_FIXTURES: "1" } : {}) },
      encoding: "utf8",
    },
  );
  if (r.status !== 0) throw new Error(`storybook build failed:\n${r.stdout}\n${r.stderr}`);
}

async function checkStory({ page, baseUrl, allowlist }, id, scheme) {
  const ctx = { story: id, scheme };
  await page.goto(`${baseUrl}/iframe.html?id=${id}&viewMode=story&globals=colorScheme:${scheme}`);
  await page.waitForSelector("body.sb-show-main, body.sb-show-errordisplay", {
    state: "attached",
    timeout: 15000,
  });
  if (await page.locator("body.sb-show-errordisplay").count())
    return [`${where(ctx)}: the story failed to render`];
  await page.evaluate(() => document.fonts.ready);

  // Stories with autoFocus or an open overlay start with focus inside; measure the unfocused style first.
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );
  const targets = await page.evaluate(probeTargets, INTERACTIVE);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  // DS-37: a control that Tab reached must look different focused than unfocused.
  const reached = await tabThrough(page, targets.length);
  const focused = [...reached].map(([index, after]) => ({
    selector: targets[index].selector,
    before: targets[index].style,
    after,
  }));
  await page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.blur(),
  );

  const overlays = await overlayResults(page);
  return [
    ...targetFindings(ctx, targets),
    ...axeFindings(ctx, axe.violations, allowlist),
    ...focusFindings(ctx, focused),
    ...overlayFindings(ctx, overlays),
  ];
}

/** Builds the catalog, runs all stories in light and dark and returns the findings (empty = conformant). */
export async function runConformance({ outDir, fixtures = false } = {}) {
  const dir = outDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "conformance-"));
  const allowlist = parseAllowlist(fs.readFileSync(allowlistFile, "utf8"));
  buildCatalog(dir, fixtures);
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const ids = Object.values(index.entries)
    .filter((e) => e.type === "story")
    .map((e) => e.id)
    .filter((id) => id.startsWith(FIXTURE_PREFIX) === fixtures);
  const { server, url } = await serve(dir);
  const browser = await chromium.launch();
  const findings = [];
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "de-DE",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    for (const scheme of SCHEMES)
      for (const id of ids)
        findings.push(...(await checkStory({ page, baseUrl: url, allowlist }, id, scheme)));
    console.log(`QG-U5 conformance: ${ids.length} stories x ${SCHEMES.length} schemes checked`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return findings;
}

async function main() {
  const report = process.argv.includes("--report");
  const findings = await runConformance();
  if (findings.length === 0) {
    console.log("QG-U5 conformance: ok");
    return;
  }
  console.error(findings.join("\n"));
  console.error(
    `\nQG-U5 conformance: ${findings.length} finding(s)${report ? " (report only)" : ""}`,
  );
  if (!report) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

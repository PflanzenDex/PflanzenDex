import type { Locator, Page } from "@playwright/test";
import { openView, signInToApp } from "../../../support/display/display";
import { expect, test } from "../../../support/fixtures";

// US-QS-32 (issue 2272): the "Bedarf" sheet at 200 % text (SG-TOUCH-01, SG-LIST-03, QG-U8). Its rows keep the height of their
// content, and the pager and the recommendations below never cover the rows or each other. The needs come from a fixture of
// the route `/equipment/needs`: the layout depends on the needs and their texts only, so it is the same on every run. Every
// other read and every write goes to the real API.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
const SHEET = "/collection?view=equipment&sheet=needs";

/** Four needs with the texts the app shows: two to three lines per row at 200 % text, so the list pages (more than one page). */
const NEEDS = [
  {
    id: "supply:soil",
    kind: "supply_low",
    reason: "„Erde“ wird knapp.",
    source: "Vorrat unter Geräte",
    nextAction: "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“.",
    target: null,
  },
  {
    id: "replace:lamp-7",
    kind: "no_replacement",
    reason: "„Lampe Süd“ ist defekt und kein anderes aktives Gerät übernimmt.",
    source: "Zustand unter Geräte",
    nextAction: "Repariere das Gerät, erfasse ein Ersatzgerät oder wünsche dir eines.",
    target: { kind: "device", id: "lamp-7" },
  },
  {
    id: "zone:zone-3",
    kind: "zone_without_lamp",
    reason: "Die Lichtzone Zone 3 hat 14 Pflanzen, aber keine aktive Lampe.",
    source: "Pflanzen je Lichtzone",
    nextAction: "Ordne dieser Zone eine aktive Lampe zu oder erfasse eine neue Lampe.",
    target: { kind: "zone", zoneId: "zone-3" },
  },
  {
    id: "supply:water",
    kind: "supply_low",
    reason: "„Dünger flüssig“ ist leer.",
    source: "Vorrat unter Geräte",
    nextAction: "Kaufe Nachschub und stelle den Vorrat danach wieder auf „Vorhanden“.",
    target: null,
  },
];

/** 200 % text, set before the page loads (`addInitScript`), as the browser's own text size is: the first layout already uses it. */
async function textAt200(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.head) return;
      const style = document.createElement("style");
      style.textContent = "html { font-size: 200% !important; }";
      document.head.append(style);
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

type Box = { top: number; bottom: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("the element has no box");
  return { top: box.y, bottom: box.y + box.height, height: box.height };
}

/** Scrolls the element into the middle of its scroll area, then asks the browser what it hits at its centre. */
async function hitsItself(target: Locator): Promise<boolean> {
  return target.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && el.contains(hit);
  });
}

/**
 * The page of the needs at the current window: every shown row is at least as high as its content (a row that shrinks cuts
 * its text, issue 2272), the pager starts below the last row, and the recommendations start below the pager.
 */
async function expectRowsAndPagerApart(page: Page, size: string): Promise<void> {
  const rows = page.getByRole("list", { name: "Fehlt / Nachkaufen" }).getByRole("listitem");
  const count = await rows.count();
  expect(count, `${size}: the needs page shows at least one row`).toBeGreaterThan(0);
  let lastBottom = 0;
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const box = await boxOf(row);
    const content = await row.evaluate((el) => el.scrollHeight);
    expect(
      box.height,
      `${size}: row ${i + 1} is ${box.height} px high, its content needs ${content} px`,
    ).toBeGreaterThanOrEqual(content - 1);
    lastBottom = Math.max(lastBottom, box.bottom);
  }
  const status = await boxOf(page.getByRole("status").filter({ hasText: /^Seite \d+ von \d+$/ }));
  const weiter = page.getByRole("button", { name: "Weiter", exact: true });
  const next = await boxOf(weiter);
  const pagerBottom = Math.max(status.bottom, next.bottom);
  expect(
    Math.min(status.top, next.top),
    `${size}: the pager starts at ${Math.min(status.top, next.top)} px, above the last row's bottom ${lastBottom} px`,
  ).toBeGreaterThanOrEqual(lastBottom - 0.5);
  const recs = await boxOf(
    page.getByRole("heading", { level: 2, name: "Empfehlungen zu deinem Bedarf" }),
  );
  expect(
    recs.top,
    `${size}: the recommendations start at ${recs.top} px, above the pager's bottom ${pagerBottom} px`,
  ).toBeGreaterThanOrEqual(pagerBottom - 0.5);
  expect(await hitsItself(weiter), `${size}: another element is hit at Weiter`).toBe(true);
}

test.describe("US-QS-32 the Bedarf sheet at 200 % text (issue 2272)", () => {
  test("US-QS-32 the Bedarf sheet on a phone at 200 % text: rows keep their height, the pager is below them and the recommendations below the pager (issue 2272)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "mobil",
      "a phone width: from 1024 px the sheet is a pane, the desktop project checks that",
    );
    await page.route(
      (url) => url.href === `${API}/equipment/needs`,
      (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": WEB },
          body: JSON.stringify({ needs: NEEDS }),
        });
      },
    );
    await signInToApp(page, account);
    await textAt200(page);
    for (const [width, height] of [
      [360, 640],
      [412, 915],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openView(page, SHEET);
      await expectRowsAndPagerApart(page, `${width}x${height} at 200 %`);
    }
  });

  test("US-QS-32 the Bedarf pane from 1024 px at 200 % text: rows keep their height, the pager is below them and the recommendations below the pager (issue 2272)", async ({
    page,
    account,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "the pane of a layer from 1024 px: the desktop project checks it, the phone project the sheet",
    );
    await page.route(
      (url) => url.href === `${API}/equipment/needs`,
      (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": WEB },
          body: JSON.stringify({ needs: NEEDS }),
        });
      },
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInToApp(page, account);
    await textAt200(page);
    await openView(page, SHEET);
    await expectRowsAndPagerApart(page, "1280x800 at 200 %");
  });
});

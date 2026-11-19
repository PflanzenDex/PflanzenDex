import type { Locator, Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";

// The checks of the "Bedarf" sheet at 200 % text (US-QS-32, issues 2272 and 2280), shared by needs-sheet.spec.ts and
// needs-sheet-pages.spec.ts. The needs come from a fixture of the route `/equipment/needs`: the layout depends on the needs
// and their texts only, so it is the same on every run. Every other read and every write goes to the real API.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
export const SHEET = "/collection?view=equipment&sheet=needs";

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
export async function textAt200(page: Page): Promise<void> {
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

/** The needs come from the fixture of `/equipment/needs`; every other read and every write goes to the real API (as before). */
export async function routeNeeds(page: Page): Promise<void> {
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
}

/**
 * The gap the pager puts between its list and its bar: the `gap-3` of the pager (0.75 rem), 24 px at 200 % text (issue 2280).
 * A sheet's list is as tall as its rows, so more blank space than that is list height the rows do not use.
 */
const PAGER_GAP_REM = 0.75;

/**
 * The page of the needs at the current window: every shown row is at least as high as its content (a row that shrinks cuts
 * its text, issue 2272), the pager starts below the last row, and the recommendations start below the pager. On a sheet
 * (`blankBand`) the pager also starts at most one pager gap below the last row (issue 2280). A pane fills its height and
 * keeps its pager at the bottom (issue 1413), so it has no such bound.
 */
export async function expectRowsAndPagerApart(
  page: Page,
  size: string,
  blankBand: boolean,
): Promise<void> {
  const rows = page.getByRole("list", { name: "Fehlt / Nachkaufen" }).getByRole("listitem");
  const count = await rows.count();
  expect(count, `${size}: the needs page shows at least one row`).toBeGreaterThan(0);
  // A page scrolled out of the sheet has its rows above the window (negative tops): the least bound must not be 0 (issue 2280).
  let lastBottom = Number.NEGATIVE_INFINITY;
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
  const back = await boxOf(page.getByRole("button", { name: "Zurück", exact: true }));
  const weiter = page.getByRole("button", { name: "Weiter", exact: true });
  const next = await boxOf(weiter);
  const pagerTop = Math.min(back.top, status.top, next.top);
  const pagerBottom = Math.max(status.bottom, next.bottom);
  expect(
    pagerTop,
    `${size}: the pager starts at ${pagerTop} px, above the last row's bottom ${lastBottom} px`,
  ).toBeGreaterThanOrEqual(lastBottom - 0.5);
  if (blankBand) {
    const rem = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    const gap = pagerTop - lastBottom;
    expect(
      gap,
      `${size}: ${gap.toFixed(1)} px of blank list space between the last row (bottom ${lastBottom} px) and the pager (top ${pagerTop} px), at most one pager gap of ${(PAGER_GAP_REM * rem).toFixed(1)} px`,
    ).toBeLessThanOrEqual(PAGER_GAP_REM * rem + 0.5);
  }
  const recs = await boxOf(
    page.getByRole("heading", { level: 2, name: "Empfehlungen zu deinem Bedarf" }),
  );
  expect(
    recs.top,
    `${size}: the recommendations start at ${recs.top} px, above the pager's bottom ${pagerBottom} px`,
  ).toBeGreaterThanOrEqual(pagerBottom - 0.5);
  // A disabled button takes no pointer (`disabled:pointer-events-none`): on the last page the hit test is on "Zurück".
  const enabled = (await weiter.isEnabled())
    ? weiter
    : page.getByRole("button", { name: "Zurück", exact: true });
  expect(
    await hitsItself(enabled),
    `${size}: another element is hit at the enabled pager button`,
  ).toBe(true);
}

/** Every page of the needs, from the first to the last: "Weiter" until it is disabled, the checks of each page (issue 2280). */
export async function expectEveryPage(page: Page, size: string, blankBand: boolean): Promise<void> {
  const weiter = page.getByRole("button", { name: "Weiter", exact: true });
  let number = 1;
  for (; number <= 10; number++) {
    await expectRowsAndPagerApart(page, `${size}, page ${number}`, blankBand);
    if (await weiter.isDisabled()) break;
    await weiter.click();
    await expect(
      page.getByRole("status").filter({ hasText: `Seite ${number + 1} von ` }),
    ).toBeVisible();
  }
  expect(number, `${size}: the needs pages on, from the first to the last`).toBeGreaterThan(1);
}

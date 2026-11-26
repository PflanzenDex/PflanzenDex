import type { Locator, Page } from "@playwright/test";
import { expect } from "../../../support/fixtures";

// The checks of the "Bedarf" sheet at 200 % text (US-QS-32, issues 2272, 2280 and 2535), used by needs-sheet.spec.ts. The needs
// come from a fixture of the route `/equipment/needs`: the layout depends on the needs and their texts only, so it is the same
// on every run. Every other read and every write goes to the real API.

const API = `http://localhost:${process.env["E2E_API_PORT"] ?? "3000"}`;
const WEB = `http://localhost:${process.env["E2E_WEB_PORT"] ?? "5173"}`;
export const SHEET = "/collection?view=equipment&sheet=needs";

/** Four needs with the texts the app shows: two to three lines per row at 200 % text, so the list is longer than its layer. */
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
 * The gap the layer puts between the list of the needs and the recommendations below it: the `gap-4` of their wrapper (1 rem),
 * 32 px at 200 % text (issue 2280). A list is as tall as its rows, so more blank space than that is list height the rows do not use.
 */
const SECTION_GAP_REM = 1;

/** The rows of the needs: every list item of the list, the end marker "Das waren alle n" included. */
const rowsOf = (page: Page) =>
  page.getByRole("list", { name: "Fehlt / Nachkaufen" }).getByRole("listitem");

/**
 * The list of the needs at the current window (a sheet below 1024 px, a pane from it): the list is the plain content of its
 * layer, which scrolls (owner decision 2026-11-23, issue 2418), so there is no pager at all. Every need is a row, and every row is
 * at least as high as its content (a row that shrinks cuts its text, issue 2272). The recommendations start below the last row
 * and at most one gap below it, so no blank band lies between them (issue 2280), and nothing lies on a row or on the heading
 * of the recommendations (issue 2535: a list of no height let its rows run over them).
 */
export async function expectRowsAndRecommendationsApart(page: Page, size: string): Promise<void> {
  const rows = rowsOf(page);
  const entries = page
    .getByRole("list", { name: "Fehlt / Nachkaufen" })
    .locator("li:not([data-list-end])");
  await expect(entries, `${size}: every need is a row of the one list`).toHaveCount(NEEDS.length);
  await expect(
    page.getByRole("button", { name: /^(Weiter|Zurück)$/ }),
    `${size}: a list in a layer has no pager`,
  ).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: /^Seite \d+ von \d+$/ }),
    `${size}: a list in a layer has no page number`,
  ).toHaveCount(0);
  const count = await rows.count();
  // The list scrolls inside its layer: its rows may stand above or below the window, so the least bound must not be 0.
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
  const recommendations = page.getByRole("heading", {
    level: 2,
    name: "Empfehlungen zu deinem Bedarf",
  });
  const recs = await boxOf(recommendations);
  expect(
    recs.top,
    `${size}: the recommendations start at ${recs.top} px, above the last row's bottom ${lastBottom} px`,
  ).toBeGreaterThanOrEqual(lastBottom - 0.5);
  const rem = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  const gap = recs.top - lastBottom;
  expect(
    gap,
    `${size}: ${gap.toFixed(1)} px of blank space between the last row (bottom ${lastBottom} px) and the recommendations (top ${recs.top} px), at most one gap of ${(SECTION_GAP_REM * rem).toFixed(1)} px`,
  ).toBeLessThanOrEqual(SECTION_GAP_REM * rem + 0.5);
  // The browser hits the row and the heading themselves at their centre: nothing lies on them (the first, the last row).
  for (const [name, target] of [
    ["the first row", rows.first()],
    ["the last row", rows.last()],
    ["the heading of the recommendations", recommendations],
  ] as const)
    expect(await hitsItself(target), `${size}: another element is hit at ${name}`).toBe(true);
}

import type { Page } from "@playwright/test";
import type { Finding, KeyboardCheck } from "../findings";
import {
  dialogClosed,
  focusOutsideMain,
  hasDialog,
  installKit,
  probeFocus,
  resetStart,
  skipLinkMiss,
  targetsOf,
  type Probe,
  type Target,
} from "./walk-page";

// The keyboard walk of the accessibility gate (FR-QG-24, issue 467): Tab only, never Enter or Space on a control (the skip
// link is the one exception). Checks: reach, focus-visible, not-hidden, no-trap, skip-link.

/** The walk stops after this many Tab presses beyond the number of interactive elements (non-target stops like scrollers). */
const SPARE_TABS = 25;
const MAX_TABS = 400;

const finding = (rule: KeyboardCheck, nodes: string[]): Finding => ({
  kind: "keyboard",
  rule,
  count: nodes.length,
  nodes,
});

/** Collects the labels of the elements that failed one check, once per element. */
class Misses {
  private readonly byRule = new Map<KeyboardCheck, Map<string, string>>();

  add(rule: KeyboardCheck, key: string, label: string): void {
    const rows = this.byRule.get(rule) ?? new Map<string, string>();
    rows.set(key, label);
    this.byRule.set(rule, rows);
  }

  findings(): Finding[] {
    return [...this.byRule].map(([rule, rows]) => finding(rule, [...rows.values()]));
  }
}

function judgeFocus(p: Probe, misses: Misses): void {
  if (!p.isTarget) return;
  if (!p.ring) misses.add("focus-visible", p.key, p.label);
  if (p.covered) misses.add("not-hidden", p.key, p.label);
}

interface Tabbed {
  order: string[];
  stuck: string | null;
}

/** Presses Tab until the focus comes back to an element seen before, stops moving or leaves the page twice. */
async function tabThrough(page: Page, targets: Target[], misses: Misses): Promise<Tabbed> {
  const seen = new Map<string, string>();
  const cap = Math.min(MAX_TABS, targets.length + SPARE_TABS);
  let last = "";
  let bodies = 0;
  for (let i = 0; i < cap; i++) {
    await page.keyboard.press("Tab");
    const p = await probeFocus(page);
    if (p.kind === "body") {
      if (++bodies >= 2) break;
      continue;
    }
    if (p.key === last && targets.length > 1) return { order: [...seen.keys()], stuck: p.label };
    if (seen.has(p.key)) break;
    seen.set(p.key, p.label);
    last = p.key;
    judgeFocus(p, misses);
  }
  return { order: [...seen.keys()], stuck: null };
}

/** Shift+Tab after the walk has to move the focus back; the same element again is a trap. */
async function backMoves(page: Page, lastKey: string | undefined): Promise<boolean> {
  if (lastKey === undefined) return true;
  const before = await probeFocus(page);
  await page.keyboard.press("Shift+Tab");
  const after = await probeFocus(page);
  return before.kind === "body" || after.key !== before.key;
}

/** Keyboard findings of the screen as it is now (a modal layer limits the walk to the dialog). */
export async function keyboardWalk(page: Page): Promise<Finding[]> {
  await installKit(page);
  const targets = await targetsOf(page);
  await resetStart(page);
  const misses = new Misses();
  const { order, stuck } = await tabThrough(page, targets, misses);
  const seen = new Set(order);
  const missed = targets.filter((t) => !seen.has(t.key));
  for (const t of missed) misses.add("reach", t.key, t.label);
  const out = misses.findings();
  if (stuck !== null) out.push(finding("no-trap", [`focus stays on ${stuck}`]));
  else if (targets.length > 1 && !(await backMoves(page, order.at(-1))))
    out.push(finding("no-trap", ["Shift+Tab does not move the focus back"]));
  return out;
}

/** On an app page without an open layer the first Tab focuses the skip link and Enter moves the focus into main. */
export async function skipLinkWalk(page: Page): Promise<Finding[]> {
  await installKit(page);
  if (await hasDialog(page)) return [];
  await resetStart(page);
  await page.keyboard.press("Tab");
  const miss = await skipLinkMiss(page);
  if (miss !== null)
    return [finding("skip-link", [`the first Tab focuses ${miss}, not the skip link`])];
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const outside = await focusOutsideMain(page);
  return outside === null
    ? []
    : [
        finding("skip-link", [
          `Enter on the skip link leaves the focus on ${outside}, not in main`,
        ]),
      ];
}

/** An open modal layer closes with Escape and the focus leaves the dialog (run last: it changes the page). */
export async function escapeWalk(page: Page): Promise<Finding[]> {
  await installKit(page);
  if (!(await hasDialog(page))) return [];
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  return (await dialogClosed(page))
    ? []
    : [finding("no-trap", ["Escape does not close the modal layer"])];
}

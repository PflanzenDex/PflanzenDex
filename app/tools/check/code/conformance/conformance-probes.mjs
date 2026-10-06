// Browser-side probes of the QG-U5 conformance run (see check-conformance.mjs). The functions passed to
// page.evaluate run inside the page and must stay self-contained.

export const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"], ' +
  '[role="radio"], [role="switch"], [role="tab"], [role="combobox"], [role="menuitem"], [role="link"], [tabindex]';

// URL of one story in the catalog. `a11y.manual:!true` (QG-U8, FR-QG-09) switches off the automatic axe run of
// @storybook/addon-a11y, which otherwise starts axe.run inside the story iframe after every render and collides
// with our own AxeBuilder run ("Axe is already running") whenever the machine is loaded. The gate runs axe itself.
export function storyUrl(baseUrl, id, scheme) {
  return `${baseUrl}/iframe.html?id=${id}&viewMode=story&globals=colorScheme:${scheme};a11y.manual:!true`;
}

// Runs inside the page (QG-U9, FR-QG-09). Resolves once the style of the story has settled: it lets two frames
// pass so that the colour scheme (applied while the story renders) has been recalculated and every transition it
// started exists, then waits until no finite animation or transition is running any more. axe reads computed
// colours, so sampling in the middle of a transition (foreground still the light-mode text colour on the dark
// background) reports a contrast failure that is not real. A real low contrast is still reported: it is the
// settled end state that gets measured. Infinite animations are skipped, they would never finish.
export async function settleStyles() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const running = () =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .filter((a) => a.playState !== "finished" && a.playState !== "idle");
  await frame();
  await frame();
  for (let round = 0; round < 20 && running().length > 0; round++) {
    await Promise.all(running().map((a) => a.finished.catch(() => undefined)));
    await frame();
  }
  return running().length;
}

// Runs inside the page. Marks the visible, enabled, tabbable controls with data-qg-i and returns their size,
// a readable selector and the style that would show a focus ring while unfocused.
export function probeTargets(selector) {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
    const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    return (
      s.visibility !== "hidden" &&
      s.display !== "none" &&
      el.closest("[aria-hidden='true']") === null
    );
  };
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    if (el.disabled || el.getAttribute("aria-disabled") === "true" || el.tabIndex < 0) continue;
    if (!visible(el)) continue;
    let rect = el.getBoundingClientRect();
    // A visually hidden native control (checkbox/radio behind a label) is hit through its label.
    const labels = el.labels ? Array.from(el.labels) : [];
    if (rect.width <= 1 && rect.height <= 1 && labels.length === 0) continue;
    for (const label of labels) {
      const r = label.getBoundingClientRect();
      if (r.width * r.height > rect.width * rect.height) rect = r;
    }
    const s = getComputedStyle(el);
    el.dataset.qgI = String(out.length);
    out.push({
      selector: describe(el),
      width: rect.width,
      height: rect.height,
      style: {
        outline: `${s.outlineColor} ${s.outlineStyle} ${s.outlineWidth}`,
        boxShadow: s.boxShadow,
      },
    });
  }
  return out;
}

// Runs inside the page: index of the focused control and the styles that show a focus ring.
export function focusSnapshot() {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el.dataset.qgI === undefined) return null;
  const s = getComputedStyle(el);
  return {
    index: Number(el.dataset.qgI),
    style: {
      outline: `${s.outlineColor} ${s.outlineStyle} ${s.outlineWidth}`,
      boxShadow: s.boxShadow,
    },
  };
}

// Tab through the page once; returns the style of every marked control at the moment it had focus.
export async function tabThrough(page, count) {
  const focused = new Map();
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press("Tab");
    const snap = await page.evaluate(focusSnapshot);
    if (snap && !focused.has(snap.index)) focused.set(snap.index, snap.style);
  }
  return focused;
}

// Esc and focus return for overlays: opened by a trigger (aria-haspopup="dialog") or open on load.
export async function overlayResults(page) {
  const results = [];
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').first();
  const triggers = await page.locator('[aria-haspopup="dialog"]:visible').count();
  for (let i = 0; i < triggers; i++) {
    const trigger = page.locator('[aria-haspopup="dialog"]:visible').nth(i);
    const name =
      (await trigger.textContent())?.trim() ||
      (await trigger.getAttribute("aria-label")) ||
      "trigger";
    await trigger.focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    await page.keyboard.press("Escape");
    const closed = await dialog.waitFor({ state: "hidden", timeout: 2000 }).then(
      () => true,
      () => false,
    );
    // Radix hands focus back after the close animation frame, so give it a moment before judging.
    const returned = await trigger.evaluate(
      (el) =>
        new Promise((resolve) => {
          const start = Date.now();
          const poll = () =>
            el === document.activeElement || Date.now() - start > 1000
              ? resolve(el === document.activeElement)
              : setTimeout(poll, 25);
          poll();
        }),
    );
    results.push({ trigger: `button "${name}"`, closedOnEsc: closed, focusReturned: returned });
  }
  if (triggers === 0 && (await dialog.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape");
    const closed = await dialog.waitFor({ state: "hidden", timeout: 2000 }).then(
      () => true,
      () => false,
    );
    results.push({ trigger: null, closedOnEsc: closed, focusReturned: null });
  }
  return results;
}

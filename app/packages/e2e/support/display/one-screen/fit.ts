import type { JSHandle, Page } from "@playwright/test";
import { lostScreen } from "./baseline";
import { boxesOf } from "./fit.boxes";
import { sizesOf } from "./fit.sizes";
import type { Raw } from "./judge";
import type { Screen, Step } from "./register";
import { settle } from "./fit.settle";

export { settle };

// Browser side of the one-screen gate (issue 1137, US-QS-15, issue 2417): opening a screen of the register, measuring one window size.

export function locatorOf(page: Page, step: Step) {
  const nth = step.nth ?? 0;
  if (step.css) return page.locator(step.css).nth(nth);
  // eslint-disable-next-line security/detect-non-literal-regexp -- the pattern comes from the checked-in register
  const name = step.re ? new RegExp(step.re, "i") : (step.name ?? "");
  const role = step.role as Parameters<Page["getByRole"]>[0];
  return page.getByRole(role, step.re ? { name } : { name, exact: true }).nth(nth);
}

// One step: a key press on the page, the choice of an option in a select (`select`), or a click (issue 1378).
export async function act(page: Page, step: Step): Promise<void> {
  if (step.key !== undefined) return page.keyboard.press(step.key);
  const target = locatorOf(page, step);
  if (step.select !== undefined) await target.selectOption(step.select, { timeout: 8000 });
  else await target.click({ timeout: 8000 });
}

/** Opens the path of a screen and follows its steps (clicks, or the choice of an option). */
export async function openScreen(page: Page, base: string, screen: Screen): Promise<void> {
  await page.goto(base + screen.path);
  await settle(page);
  const lost = lostScreen(base + screen.path, page.url());
  if (lost) throw new Error(`${screen.id}: ${lost}`);
  for (const step of screen.steps ?? []) {
    const failed = (error: Error) => {
      throw new Error(`${screen.id}: step ${JSON.stringify(step)} failed: ${error.message}`);
    };
    await act(page, step).catch(failed);
    await settle(page);
  }
}

// Found elements are named for the failure text (tag, role, id, label or classes, start of the text). The farthest element ignores
// fixed boxes and scroll regions; the painted edges belong to the left-most and right-most visible element that paints text,
// media, a background or a border.
export type Found = JSHandle<Element | null>;

export async function label(handle: Found): Promise<string> {
  return handle.evaluate((el) => {
    if (!el) return "";
    const role = el.getAttribute("role");
    const aria = el.getAttribute("aria-label") ?? "";
    const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
    const tail = aria
      ? `[aria-label="${aria.slice(0, 30)}"]`
      : classes.map((c) => `.${c}`).join("");
    const base = `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}${el.id ? `#${el.id}` : ""}${tail}`;
    return text ? `${base} "${text}"` : base;
  });
}

const farthestHandle = (page: Page, axis: "bottom" | "right"): Promise<Found> =>
  page.evaluateHandle((side) => {
    const clipped = (start: Element) => {
      for (let at: Element | null = start; at && at !== document.body; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.position === "fixed" || (at !== start && /(auto|scroll)/.test(style.overflowY)))
          return true;
      }
      return false;
    };
    let far = -Infinity;
    let found: Element | null = null;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const edge = side === "bottom" ? r.bottom + window.scrollY : r.right + window.scrollX;
      if (r.width <= 1 || r.height <= 1 || edge <= far || clipped(el)) continue;
      far = edge;
      found = el;
    }
    return found;
  }, axis);

const paintHandle = (page: Page) =>
  page.evaluateHandle(() => {
    const paints = (el: Element, st: CSSStyleDeclaration) => {
      const border = ["top", "right", "bottom", "left"].some(
        (k) =>
          parseFloat(st.getPropertyValue(`border-${k}-width`)) > 0 &&
          st.getPropertyValue(`border-${k}-style`) !== "none",
      );
      const text = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      );
      const media = /^(IMG|SVG|INPUT|SELECT|TEXTAREA|BUTTON|VIDEO|CANVAS)$/i.test(el.tagName);
      return (
        media || text || border || !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(st.backgroundColor)
      );
    };
    const edges = {
      left: Infinity,
      right: -Infinity,
      leftEl: null as Element | null,
      rightEl: null as Element | null,
    };
    for (const el of document.body.querySelectorAll("*")) {
      const rc = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (el.closest("[aria-hidden='true']") || rc.width <= 1 || rc.height <= 1) continue;
      // What a marked sideways region holds is clipped by it (a card row, a chip row, a table, a tab strip: `data-scroll-x`,
      // DS-63): its own box is measured, the cards that wait beyond its edge do not paint on the page (issue 2421, d-163).
      if (el.parentElement?.closest("[data-scroll-x]")) continue;
      if (st.visibility === "hidden" || +st.opacity === 0 || !paints(el, st)) continue;
      if (rc.left < edges.left) Object.assign(edges, { left: rc.left, leftEl: el });
      if (rc.right > edges.right) Object.assign(edges, { right: rc.right, rightEl: el });
    }
    return edges;
  });

async function paintOf(page: Page): Promise<Raw["paint"]> {
  const edges = await paintHandle(page);
  const numbers = await edges.evaluate((e) => ({
    left: e.left,
    right: e.right,
    clientWidth: document.documentElement.clientWidth,
  }));
  const leftEl = (await edges.getProperty("leftEl")) as Found;
  const rightEl = (await edges.getProperty("rightEl")) as Found;
  return { ...numbers, leftEl: await label(leftEl), rightEl: await label(rightEl) };
}

/** Measures the open page at its current window size (issue 1137, US-QS-15): page height and width, scroll boxes, markers, Pagers, sized boxes, painted width. */
export async function measure(page: Page, withPaint: boolean): Promise<Raw> {
  const dims = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: root.scrollHeight,
      innerHeight,
      scrollWidth: root.scrollWidth,
      innerWidth,
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  const boxes = await boxesOf(page);
  const sized = await sizesOf(page);
  return {
    ...dims,
    ...boxes,
    sized,
    pageEl:
      dims.scrollHeight > dims.innerHeight + 1
        ? await label(await farthestHandle(page, "bottom"))
        : "",
    hEl: dims.scrollWidth > dims.innerWidth ? await label(await farthestHandle(page, "right")) : "",
    paint: withPaint ? await paintOf(page) : null,
  };
}

import type { JSHandle, Page } from "@playwright/test";
import { label, type Found } from "./fit";
import type { First, Spot } from "./judge";

// Browser side of the frame rule (US-QS-15, DS-58, QG-U8; issue 2417): what a view shows at load and while its largest region
// scrolls. The scope is the open layer (the last visible dialog) or else main. The title is the heading that names the layer, or
// else the first h1 of the page (it sits in the global header on Heute, in main on a sub-page). The primary action is the first
// visible, enabled button or link that the shared Button paints as its `default` variant (`bg-primary`; button.tsx has no data
// attribute for it). What a closed `<details>` or an `aria-hidden` subtree holds is not there. A bar is a fixed or sticky box that
// covers the bottom edge, is at most half the window and is really on top there (a layer's backdrop, or a bar behind a layer, is
// not); it does not hide what it contains. An open layer is measured on its own: how far its box reaches. After the load the
// largest vertical scroll region is scrolled to its end, the title and the action are measured again there, and its scroll
// position and inline scroll behaviour are restored.
const contentHandle = (page: Page) =>
  page.evaluateHandle(() => {
    // `checkVisibility` also drops what a closed `<details>` hides (content-visibility), which still has boxes.
    const shown = (el: Element) =>
      !el.closest("[aria-hidden='true'], [inert]") &&
      el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const layers = document.querySelectorAll("[role='dialog'], [role='alertdialog']");
    const layer = [...layers].filter(shown).pop() ?? null;
    const scope = layer ?? document.querySelector("main") ?? document.body;
    const names = layer?.getAttribute("aria-labelledby")?.split(" ") ?? [];
    const named = names.map((id) => document.getElementById(id)).find((el) => el && shown(el));
    // The h1 of a page sits in the global header, outside main (Heute), or in main (sub-pages): search the document.
    const headings = layer ? layer.querySelectorAll("h1, h2") : document.querySelectorAll("h1");
    const title = named ?? [...headings].find(shown) ?? null;
    const primary = scope.querySelectorAll(
      "button.bg-primary, a.bg-primary, [role='button'].bg-primary",
    );
    const action = [...primary].find(
      (el) => shown(el) && !el.matches(":disabled, [aria-disabled='true']"),
    );
    return { title, action: action ?? null, layer };
  });

// Per element: its box and where its first screen ends (`limit`): the window height, the top of the highest bar that does
// not contain it, or the bottom of a region that clips it (`overflow` is not visible), whichever is highest.
const coverOf = (content: { title: Element | null; action: Element | null }) => {
  const bars: { el: Element; top: number }[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    const position = getComputedStyle(el).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const box = el.getBoundingClientRect();
    const covers = box.bottom >= innerHeight - 1 && box.top < innerHeight - 1;
    if (!covers || box.height <= 1 || box.height > innerHeight / 2) continue;
    const hit = document.elementFromPoint(box.left + box.width / 2, innerHeight - 2);
    if (hit && el.contains(hit)) bars.push({ el, top: box.top });
  }
  bars.sort((a, b) => a.top - b.top);
  const ends: Element[] = [];
  const spot = (el: Element | null) => {
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const bar = bars.find((b) => !b.el.contains(el));
    let by: Element | undefined = bar?.el;
    let limit = bar?.top ?? innerHeight;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      const bottom = up.getBoundingClientRect().bottom;
      if (getComputedStyle(up).overflowY === "visible" || bottom >= limit) continue;
      [by, limit] = [up, bottom];
    }
    return { top: box.top, bottom: box.bottom, limit, bar: by ? ends.push(by) - 1 : -1 };
  };
  const spots = {
    title: spot(content.title),
    action: spot(content.action),
  };
  return { spots, bars: ends };
};

// The open layer's own box: the page behind a layer is not part of it (issue 1854).
const layerReach = (content: { layer: Element | null }) => {
  const layer = content.layer;
  if (!layer) return null;
  const box = layer.getBoundingClientRect();
  return Math.max(box.bottom, innerHeight - box.top);
};

type Measured = { top: number; bottom: number; limit: number; bar: number } | null;

const handlesOf = async (handle: JSHandle): Promise<Found[]> =>
  [...(await handle.getProperties()).values()] as Found[];

// A sheet still sliding or resizing after the window changed has a box that moves: wait (at most 3 s) until it held still for 300 ms.
const settleLayer = (page: Page) =>
  page.evaluate(async () => {
    const layer = [...document.querySelectorAll("[role='dialog'], [role='alertdialog']")].pop();
    let last = "";
    let still = 0;
    for (let tries = 0; layer && still < 3 && tries < 30; tries++) {
      const box = layer.getBoundingClientRect();
      const key = `${box.top}|${box.bottom}`;
      still = key === last ? still + 1 : 0;
      last = key;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

/** The title and the primary action of the content, measured where the page is now. */
async function measureContent(
  content: JSHandle<{ title: Element | null; action: Element | null }>,
): Promise<{ title: Spot | null; action: Spot | null }> {
  const cover = await content.evaluateHandle(coverOf);
  const spots = await cover.evaluate((c) => c.spots);
  const bars = await handlesOf(await cover.getProperty("bars"));
  const spot = async (m: Measured, el: Found): Promise<Spot | null> =>
    m
      ? { ...m, el: await label(el), bar: m.bar < 0 ? "" : await label(bars[m.bar] as Found) }
      : null;
  return {
    title: await spot(spots.title, (await content.getProperty("title")) as Found),
    action: await spot(spots.action, (await content.getProperty("action")) as Found),
  };
}

// The largest vertical scroll region of the page (never the document itself): the one that scrolls while the frame stays in place.
const largestRegion = (page: Page): Promise<Found> =>
  page.evaluateHandle(() => {
    let best: Element | null = null;
    let ratio = 1;
    for (const el of document.querySelectorAll("*")) {
      if (el === document.documentElement || el === document.body) continue;
      const style = getComputedStyle(el);
      if (!/(auto|scroll)/.test(style.overflowY) || style.visibility === "hidden") continue;
      if (el.clientHeight < 80 || el.getClientRects().length === 0) continue;
      if (el.scrollHeight / el.clientHeight > ratio) {
        ratio = el.scrollHeight / el.clientHeight;
        best = el;
      }
    }
    return best;
  });

/** The title and the action while the largest region scrolls to its end; null when no region scrolls. The position is restored. */
async function scrolledOf(
  page: Page,
  content: JSHandle<{ title: Element | null; action: Element | null }>,
): Promise<First["scrolled"]> {
  const region = await largestRegion(page);
  if (await region.evaluate((el) => el === null)) return null;
  const el = await label(region);
  const before = await region.evaluate((node) => {
    const element = node as HTMLElement;
    const prev = { top: element.scrollTop, behavior: element.style.scrollBehavior };
    element.style.scrollBehavior = "auto";
    element.scrollTop = element.scrollHeight;
    return prev;
  });
  // Two frames: the scroll and the layout of the frame it moves are done when the measure reads them.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  const measured = await measureContent(content);
  await region.evaluate((node, prev) => {
    const element = node as HTMLElement;
    element.scrollTop = prev.top;
    element.style.scrollBehavior = prev.behavior;
  }, before);
  return { el, title: measured.title, action: measured.action };
}

/** Measures what the open page shows in the window at load and while its largest region scrolls to the end. */
export async function firstOf(page: Page): Promise<First> {
  await settleLayer(page);
  const content = await contentHandle(page);
  const { title, action } = await measureContent(content);
  const reach = await content.evaluate(layerReach);
  const layer =
    reach === null
      ? null
      : { reach, el: await label((await content.getProperty("layer")) as Found) };
  return { title, action, scrolled: await scrolledOf(page, content), layer };
}

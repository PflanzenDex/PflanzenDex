import type { JSHandle, Page } from "@playwright/test";
import { label, type Found } from "./fit";
import type { First, Layer, Spot } from "./judge";

// Browser side of the first-screen rule (issue 1854, QG-U8, US-QS-15): what a phone shows at load. The scope is the open
// layer (the last visible dialog) or else main. The title is the heading that names the layer, or else the first h1 of the
// page (it sits in the global header on Heute, in main on a sub-page). The rows are the first two of the largest list
// (`li`, `[role=listitem]`, `[role=row]`). The primary action is the first visible, enabled button or link that the shared
// Button paints as its `default` variant (`bg-primary`; button.tsx has no data attribute for it). What a closed `<details>`
// or an `aria-hidden` subtree holds is not there. A bar is a fixed or sticky box that covers the bottom edge, is at most
// half the window and is really on top there (a layer's backdrop, or a bar behind a layer, is not); it does not hide what
// it contains. An open layer is also measured on its own: how far its box reaches and its largest scroll region.
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
    const lists = "ul, ol, table, [role='list'], [role='table'], [role='grid']";
    let rows: Element[] = [];
    let area = 0;
    for (const list of scope.querySelectorAll(lists)) {
      const own = [...list.querySelectorAll("li, [role='listitem'], [role='row']")];
      const mine = own.filter((row) => row.closest(lists) === list && shown(row));
      const box = list.getBoundingClientRect();
      if (mine.length > 0 && box.width * box.height > area) {
        rows = mine;
        area = box.width * box.height;
      }
    }
    const primary = scope.querySelectorAll(
      "button.bg-primary, a.bg-primary, [role='button'].bg-primary",
    );
    const action = [...primary].find(
      (el) => shown(el) && !el.matches(":disabled, [aria-disabled='true']"),
    );
    return { title, rows: rows.slice(0, 2), action: action ?? null, layer };
  });

// Per element: its box and where its first screen ends (`limit`): the window height, the top of the highest bar that does
// not contain it, or the bottom of a region that clips it (`overflow` is not visible), whichever is highest.
const coverOf = (content: { title: Element | null; rows: Element[]; action: Element | null }) => {
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
    rows: content.rows.map(spot),
    action: spot(content.action),
  };
  return { spots, bars: ends };
};

// The open layer's own box and its largest scroll region: the page behind a layer is not part of it (issue 1854).
const layerOf = (content: { layer: Element | null }) => {
  const layer = content.layer;
  if (!layer) return null;
  const box = layer.getBoundingClientRect();
  let region: Element | null = null;
  let ratio = 0;
  for (const el of [layer, ...layer.querySelectorAll("*")]) {
    const scrolls = /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.clientHeight >= 80;
    const seen = el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    if (scrolls && seen && el.scrollHeight / el.clientHeight > ratio) {
      ratio = el.scrollHeight / el.clientHeight;
      region = el;
    }
  }
  return { reach: Math.max(box.bottom, innerHeight - box.top), region };
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

/** Measures what the open page shows in the first screen of the window (phone sizes only). */
export async function firstOf(page: Page): Promise<First> {
  await settleLayer(page);
  const content = await contentHandle(page);
  const cover = await content.evaluateHandle(coverOf);
  const spots = await cover.evaluate((c) => c.spots);
  const bars = await handlesOf(await cover.getProperty("bars"));
  const spot = async (m: Measured, el: Found | undefined): Promise<Spot | null> =>
    m && el
      ? { ...m, el: await label(el), bar: m.bar < 0 ? "" : await label(bars[m.bar] as Found) }
      : null;
  const rows = await handlesOf(await content.getProperty("rows"));
  const found = await content.evaluateHandle(layerOf);
  const box = await found.evaluate(
    (f) =>
      f && {
        reach: f.reach,
        region: f.region && {
          scrollHeight: f.region.scrollHeight,
          clientHeight: f.region.clientHeight,
        },
      },
  );
  const layer: Layer | null = box && {
    reach: box.reach,
    el: await label((await content.getProperty("layer")) as Found),
    region: box.region && {
      ...box.region,
      el: await label((await found.getProperty("region")) as Found),
    },
  };
  return {
    title: await spot(spots.title, (await content.getProperty("title")) as Found),
    rows: (await Promise.all(spots.rows.map((m, i) => spot(m, rows[i])))) as Spot[],
    action: await spot(spots.action, (await content.getProperty("action")) as Found),
    // The register names every Heute screen and layer with the path /today (ids today, today-sheet-*, today-tasks).
    heute: new URL(page.url()).pathname === "/today",
    layer,
  };
}

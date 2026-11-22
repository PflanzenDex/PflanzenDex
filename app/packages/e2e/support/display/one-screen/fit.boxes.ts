import type { Page } from "@playwright/test";
import type { Raw } from "./judge";

// The scroll boxes of the page for the one-screen gate (issue 2417, US-QS-15): read in the page, judged in judge.ts.

/**
 * Every scroll box of the page at its current window size: the elements that scroll up and down or sideways (more content
 * than box, a visible box of at least 80 px), each with whether it is marked; every element with a `data-scroll-x` attribute,
 * with its value ("" without one); and every visible Pager (`data-pager`). The labels are named in the page.
 */
export async function boxesOf(
  page: Page,
): Promise<Pick<Raw, "scrollers" | "sideways" | "markers" | "pagers">> {
  return page.evaluate(() => {
    const describe = (el: Element): string => {
      const role = el.getAttribute("role");
      const aria = el.getAttribute("aria-label") ?? "";
      const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2);
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
      const tail = aria
        ? `[aria-label="${aria.slice(0, 30)}"]`
        : classes.map((c) => `.${c}`).join("");
      const base = `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}${el.id ? `#${el.id}` : ""}${tail}`;
      return text ? `${base} "${text}"` : base;
    };
    const shown = (el: Element) =>
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const scrollers: { el: string; marked: boolean; scroll: number; client: number }[] = [];
    const sideways: { el: string; marker: string | null; scroll: number; client: number }[] = [];
    const markers: { el: string; value: string }[] = [];
    const pagers: string[] = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.hasAttribute("data-scroll-x"))
        markers.push({ el: describe(el), value: el.getAttribute("data-scroll-x") ?? "" });
      if (!shown(el)) continue;
      if (el.hasAttribute("data-pager")) pagers.push(describe(el));
      const st = getComputedStyle(el);
      if (
        /(auto|scroll)/.test(st.overflowY) &&
        el.clientHeight >= 80 &&
        el.scrollHeight > el.clientHeight + 1
      )
        scrollers.push({
          el: describe(el),
          marked: el.hasAttribute("data-scroll-region"),
          scroll: el.scrollHeight,
          client: el.clientHeight,
        });
      if (
        /(auto|scroll)/.test(st.overflowX) &&
        el.clientWidth >= 80 &&
        el.scrollWidth > el.clientWidth + 1
      )
        sideways.push({
          el: describe(el),
          marker: el.getAttribute("data-scroll-x"),
          scroll: el.scrollWidth,
          client: el.clientWidth,
        });
    }
    return { scrollers, sideways, markers, pagers };
  });
}

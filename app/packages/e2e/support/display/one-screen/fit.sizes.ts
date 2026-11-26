import type { Page } from "@playwright/test";
import type { Sized } from "./judge.types";

// The sized boxes of the page for the size floors of the one-screen gate (issue 2431, P-S): read in the page, judged in
// judge.size.ts. A card picture is the box of `[data-card-picture]` (CardPicture), a row is `[data-object-row]` (ObjectRow),
// a name is `[data-row-name]` (the title of an object row); only boxes that are shown count.
export async function sizesOf(page: Page): Promise<Sized> {
  return page.evaluate(() => {
    const shown = (el: Element) =>
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const name = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
      return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`;
    };
    const all = (selector: string) => [...document.querySelectorAll(selector)].filter(shown);
    const pictures = all("[data-card-picture] > div").map((el) => {
      const r = el.getBoundingClientRect();
      return { el: name(el.parentElement ?? el), width: r.width, height: r.height };
    });
    const rows = all("[data-object-row]").map((el) => ({
      el: name(el),
      height: el.getBoundingClientRect().height,
    }));
    const titles = all("[data-row-name]");
    const lineOf = (el: Element) => {
      const st = getComputedStyle(el);
      const lh = parseFloat(st.lineHeight);
      return Number.isFinite(lh) ? lh : parseFloat(st.fontSize) * 1.2;
    };
    const texts = titles.map((el) => ({
      el: name(el),
      height: el.getBoundingClientRect().height,
      lineHeight: lineOf(el),
    }));
    const names = titles.map((el) => ({ el: name(el), width: el.getBoundingClientRect().width }));
    return { pictures, texts, rows, names };
  });
}

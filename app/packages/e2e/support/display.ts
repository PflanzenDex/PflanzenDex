import { expect, type Page } from "@playwright/test";
import type { TestAccount } from "./account";

// Helpers for the adaptable display checks (US-QS-12): every view, measured in the real browser.

/** The views every account can open (the role-bound review and operator views redirect to the start view). */
export const VIEWS = [
  "/",
  "/species",
  "/collection",
  "/treatments",
  "/hints",
  "/care-phases",
  "/care-profile",
  "/difficulty",
  "/pokedex",
  "/wishlist",
  "/light",
  "/account",
  "/settings",
] as const;

/** WCAG 1.4.12: the text spacing a user may set (line height 1.5, paragraphs 2, letters 0.12, words 0.16). */
export const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

/** Signs in through the real sign-in service and waits until the app shell stands, on every width. */
export async function signInToApp(page: Page, account: TestAccount): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.locator("#username").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("banner").getByRole("link", { name: "PflanzenDex" })).toBeVisible();
}

/** Opens a view and waits until it has loaded: a main heading and no running request. */
export async function openView(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
}

/**
 * Layout problems of the current page (1.4.10, 1.4.4, 1.4.12): the page scrolls sideways, a visible element
 * sticks out of the viewport, or a box hides part of its own content (overflow hidden or clip with more
 * content than room, which is how fixed heights and `overflow-hidden` cut text off). Visually hidden helpers
 * (boxes of 1 px or less, such as sr-only texts) do not count.
 */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const label = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const cls = (el.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".");
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${text}"`;
    };
    const shown = (el: Element, style: CSSStyleDeclaration) => {
      const r = el.getBoundingClientRect();
      const tiny = r.width <= 1 || r.height <= 1;
      return style.display !== "none" && style.visibility !== "hidden" && !tiny;
    };
    const clips = (value: string) => value === "hidden" || value === "clip";
    const problemsOf = (el: Element, style: CSSStyleDeclaration): string[] => {
      const r = el.getBoundingClientRect();
      const found: string[] = [];
      if (r.right > width + 1 || r.left < -1)
        found.push(`sticks out (${Math.round(r.left)}..${Math.round(r.right)} of ${width})`);
      if (clips(style.overflowX) && el.scrollWidth > el.clientWidth + 1)
        found.push(`cuts off sideways (${el.scrollWidth} > ${el.clientWidth})`);
      if (clips(style.overflowY) && el.scrollHeight > el.clientHeight + 1)
        found.push(`cuts off below (${el.scrollHeight} > ${el.clientHeight})`);
      if (style.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        found.push("ellipsis hides text");
      return found.map((p) => `${p}: ${label(el)}`);
    };
    const root = document.documentElement;
    const page =
      root.scrollWidth > width + 1
        ? [`page scrolls sideways (${root.scrollWidth} > ${width})`]
        : [];
    const elements = Array.from(document.body.querySelectorAll("*")).filter(
      (el) => !el.closest("[aria-hidden='true']"),
    );
    return page.concat(
      elements.flatMap((el) => {
        const style = getComputedStyle(el);
        return shown(el, style) ? problemsOf(el, style) : [];
      }),
    );
  });
}

/** Elements that would need the 1.4.13 behavior (Esc, hoverable, persistent): native and ARIA tooltips. */
export async function tooltips(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[title], [role='tooltip']")).map(
      (el) => `${el.tagName.toLowerCase()} ${el.getAttribute("title") ?? el.textContent ?? ""}`,
    ),
  );
}

/** What the focused element shows as focus indicator: its outline or a box shadow (the ring). */
export async function focusIndicator(
  page: Page,
): Promise<{ element: string; outline: string; ring: string } | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle === "none" || parseFloat(style.outlineWidth) < 1
        ? "none"
        : `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
    const text = (el.textContent ?? "").trim().slice(0, 30);
    return { element: `${el.tagName.toLowerCase()} "${text}"`, outline, ring: style.boxShadow };
  });
}

/**
 * Controls (buttons and fields) without a border. In forced colors the system replaces backgrounds, so the border is
 * their only boundary. Native checkboxes and radios draw their own system boundary.
 */
export async function controlsWithoutBoundary(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "button, input:not([type='checkbox']):not([type='radio']), select, textarea",
      ),
    )
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden";
      })
      .filter((el) => {
        const s = getComputedStyle(el);
        const widths = [
          s.borderTopWidth,
          s.borderRightWidth,
          s.borderBottomWidth,
          s.borderLeftWidth,
        ];
        return widths.every((w) => parseFloat(w) === 0);
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"`),
  );
}

/** Status texts (role status or alert) whose text colour equals the colour behind them, so they cannot be read. */
export async function unreadableStatusTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const behind = (el: Element | null): string => {
      for (let at = el; at; at = at.parentElement) {
        const bg = getComputedStyle(at).backgroundColor;
        if (bg !== "transparent" && !bg.endsWith(", 0)")) return bg;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    return Array.from(document.querySelectorAll("[role='status'], [role='alert']"))
      .filter((el) => (el.textContent ?? "").trim() !== "")
      .filter((el) => getComputedStyle(el).color === behind(el))
      .map((el) => (el.textContent ?? "").trim().slice(0, 40));
  });
}

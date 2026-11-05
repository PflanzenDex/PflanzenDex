import type { Page } from "@playwright/test";
import { installLook } from "./look";

// Browser side of the keyboard walk (FR-QG-24, issue 467): three installs put a toolbox on `window.__kw`. Nothing here
// changes the page except `resetStart`, which moves the focus navigation start to the page start (or the modal layer).

/** An interactive element; the radios of one group share a `key` (only one is in the Tab order). */
export interface Target {
  key: string;
  label: string;
}

/** What the focused element looks like after a Tab. */
export interface Probe {
  kind: "body" | "element";
  key: string;
  label: string;
  isTarget: boolean;
  ring: boolean;
  inViewport: boolean;
  covered: boolean;
}

export type Fn<A extends unknown[], R> = (...args: A) => R;
export interface Kit {
  idOf: Fn<[Element], string>;
  keyOf: Fn<[Element], string>;
  label: Fn<[Element], string>;
  visible: Fn<[Element], boolean>;
  dialogEl: Fn<[], Element | null>;
  isTarget: Fn<[Element], boolean>;
  ring: Fn<[Element], boolean>;
  covered: Fn<[Element], { inViewport: boolean; covered: boolean }>;
  SEL: string;
  methods: Record<string, Fn<[], unknown>>;
}
export type KitWindow = Window & { __kw: Kit };

// Part 1: naming, visibility, the modal layer and which elements count as interactive.
function installBasics(): void {
  const ids = new WeakMap<Element, number>();
  let next = 1;
  const idOf = (el: Element): string => {
    if (!ids.has(el)) ids.set(el, next++);
    return String(ids.get(el));
  };
  const keyOf = (el: Element): string =>
    el instanceof HTMLInputElement && el.type === "radio" && el.name
      ? `radio:${el.form ? idOf(el.form) : ""}:${el.name}`
      : idOf(el);
  const label = (el: Element): string => {
    const role = el.getAttribute("role");
    const text = el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "";
    const name = (text || (el.getAttribute("title") ?? ""))
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 30);
    return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}${el.id ? `#${el.id}` : ""}${name ? ` "${name}"` : ""}`;
  };
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const shown = el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true });
    return shown && r.width > 0 && r.height > 0;
  };
  const dialogEl = (): Element | null =>
    [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open]')]
      .filter((d) => visible(d) && !d.closest('[aria-hidden="true"],[inert]'))
      .pop() ?? null;
  const SEL =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable="true"]';
  const hiddenRadio = (el: Element): boolean =>
    el instanceof HTMLInputElement &&
    el.type === "radio" &&
    !!el.name &&
    !el.checked &&
    !!document.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
  const isTarget = (el: Element): boolean =>
    el.matches(SEL) &&
    (el as HTMLElement).tabIndex >= 0 &&
    !el.matches(":disabled") &&
    !el.closest('[inert],[aria-hidden="true"]') &&
    !hiddenRadio(el) &&
    visible(el);
  const kit = { idOf, keyOf, label, visible, dialogEl, isTarget, SEL, methods: {} };
  (window as unknown as { __kw: unknown }).__kw = kit;
}

function installMethods(): void {
  const k = (window as unknown as KitWindow).__kw;
  const m = k.methods;
  m["targets"] = () => {
    const found = new Map<string, Target>();
    for (const el of (k.dialogEl() ?? document.body).querySelectorAll(k.SEL))
      if (k.isTarget(el) && !found.has(k.keyOf(el)))
        found.set(k.keyOf(el), { key: k.keyOf(el), label: k.label(el) });
    return [...found.values()];
  };
  m["probe"] = (): Probe => {
    const a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement)
      return {
        kind: "body",
        key: "",
        label: "body",
        isTarget: false,
        ring: true,
        inViewport: true,
        covered: false,
      };
    const [key, label, isTarget, ring] = [k.keyOf(a), k.label(a), k.isTarget(a), k.ring(a)];
    return { kind: "element", key, label, isTarget, ring, ...k.covered(a) };
  };
  m["resetStart"] = () => {
    const probe = document.createElement("span");
    probe.tabIndex = -1;
    (k.dialogEl() ?? document.body).prepend(probe);
    probe.focus({ preventScroll: true });
    probe.remove();
    window.scrollTo(0, 0);
  };
  m["hasDialog"] = () => k.dialogEl() !== null;
  m["skipLinkMiss"] = () => {
    const a = document.activeElement;
    return a && /zum inhalt springen/i.test((a as HTMLElement).innerText ?? "")
      ? null
      : k.label(a ?? document.body);
  };
  m["outsideMain"] = () => {
    const a = document.activeElement;
    return a?.closest("main") ? null : k.label(a ?? document.body);
  };
  m["dialogClosed"] = () => {
    const d = k.dialogEl();
    return d === null || !d.contains(document.activeElement);
  };
}

export async function installKit(page: Page): Promise<void> {
  await page.evaluate(installBasics);
  await page.evaluate(installLook);
  await page.evaluate(installMethods);
}

const call = <T>(page: Page, name: string): Promise<T> =>
  page.evaluate((n) => (window as unknown as KitWindow).__kw.methods[n]?.(), name) as Promise<T>;

export const targetsOf = (page: Page) => call<Target[]>(page, "targets");
export const probeFocus = (page: Page) => call<Probe>(page, "probe");
export const resetStart = (page: Page) => call<unknown>(page, "resetStart");
export const hasDialog = (page: Page) => call<boolean>(page, "hasDialog");
export const skipLinkMiss = (page: Page) => call<string | null>(page, "skipLinkMiss");
export const focusOutsideMain = (page: Page) => call<string | null>(page, "outsideMain");
export const dialogClosed = (page: Page) => call<boolean>(page, "dialogClosed");

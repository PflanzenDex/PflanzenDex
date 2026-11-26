import { hasLayout, pressEscape, waitUntil } from "./story-play";

/**
 * Helpers of the play functions of the sheet and the layers (US-QS-15, sheet and layer heights; P-B, issue 2432). A play
 * measures only where there is layout: the jsdom runs of the stories (a dialog at 768 px, a sheet without any size) skip
 * the measures, and the browser run of the conformance judges them at 360 x 640 px.
 */

/** The dialog of the open layer: a sheet, a dialog or (not in a story window) a pane. */
export const layerOf = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="dialog"]');

/** The sheet of the open layer, `null` where the layer is a dialog or a pane. */
export const sheetOf = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-sheet-height]");

/** What a polite announcement said last. */
export const liveText = (): string =>
  document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? "";

/** The height of the visible window: the visual viewport, which the keyboard and a zoom shrink, else the window. */
export const visibleHeight = (): number => window.visualViewport?.height ?? window.innerHeight;

export const heightOf = (element: Element): number => element.getBoundingClientRect().height;

/** Opens the layer with its opener (the first control that opens a dialog) and waits until the layer is there. */
export async function openLayer(canvas: HTMLElement): Promise<HTMLElement> {
  const opener = canvas.querySelector<HTMLElement>('[aria-haspopup="dialog"]');
  if (!opener) throw new Error("play: the opener of the layer is missing");
  opener.click();
  await waitUntil(() => layerOf() !== null, "the layer opens", 5000);
  await waitUntil(
    () => layerOf()?.contains(document.activeElement) === true,
    "the focus moves into the layer",
  );
  return layerOf() as HTMLElement;
}

/** Closes the layer with Escape and waits until it has left the page: a play ends with the component closed. */
export async function closeLayer(): Promise<void> {
  pressEscape(document.activeElement ?? document.body);
  await waitUntil(() => layerOf() === null, "the layer closes on Escape", 3000);
}

/** Waits until the height of `element` is `expected` px, give or take `slack` px (a transition may still run). */
export async function waitForHeight(element: Element, expected: number, what: string, slack = 3) {
  await waitUntil(
    () => Math.abs(heightOf(element) - expected) <= slack,
    `${what} (${expected} px)`,
  );
}

/** Waits for the sheet to name its heights: `two` once the content is measured as longer than half. */
export const waitForKind = (sheet: HTMLElement, kind: string) =>
  waitUntil(
    () => sheet.getAttribute("data-sheet-height") === kind,
    `the sheet has the heights "${kind}"`,
  );

function pointer(type: string, target: EventTarget, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 180,
      clientY: y,
    }),
  );
}

/** A finger goes down on `target` at `from`, moves to each `to` and lets go at the last. */
export function drag(target: Element, from: number, ...to: number[]): void {
  pointer("pointerdown", target, from);
  for (const y of to) pointer("pointermove", window, y);
  pointer("pointerup", window, to[to.length - 1] ?? from);
}

/** A key press on `target`, as a keyboard user does. */
export function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Clicks the button with the name `name` inside `scope`. */
export function clickButton(scope: ParentNode, name: string): void {
  const button = Array.from(scope.querySelectorAll<HTMLElement>("button")).find(
    (b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
  );
  if (!button) throw new Error(`play: no button "${name}"`);
  button.click();
}

/**
 * Opens the layer and waits until its sheet has two heights. Returns `null` where a play cannot measure (no layout in jsdom, a
 * dialog at 768 px): the layer is then closed again, as a play ends with the component closed.
 */
export async function openTwoHeights(canvas: HTMLElement): Promise<HTMLElement | null> {
  await openLayer(canvas);
  const sheet = sheetOf();
  if (!sheet || !hasLayout(sheet)) {
    await closeLayer();
    return null;
  }
  await waitForKind(sheet, "two");
  return sheet;
}

/** Types `value` into a field of a React form, as a keeper does: the field's own setter, then the input event React reads. */
export function typeInto(field: HTMLInputElement, value: string): void {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!set) throw new Error("play: an input field has no value setter");
  set.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

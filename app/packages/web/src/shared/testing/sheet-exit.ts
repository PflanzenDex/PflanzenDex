import { act } from "@testing-library/react";

/**
 * Test helpers for the exit of a sheet (US-QS-15). jsdom runs no CSS animations, so a closing sheet would unmount at once.
 * `holdSheetExit` makes an open or closing Vaul sheet name the animation the browser gives it (`slideFromBottom` when it
 * opens, `slideToBottom` when it closes), so Radix Presence keeps the sheet until `endSheetExit` ends that animation.
 * A test that holds an exit calls `releaseSheetExits` after it (in an `afterEach` of its file).
 */
type Globals = {
  getComputedStyle: typeof getComputedStyle;
  CSS: { escape?: (value: string) => string } | undefined;
};

let restore: (() => void) | null = null;

export function holdSheetExit(): void {
  if (restore) return;
  const globals = globalThis as unknown as Globals;
  const realStyle = globals.getComputedStyle;
  const realCss = globals.CSS;
  globals.getComputedStyle = (element: Element, pseudo?: string | null) => {
    const style = realStyle.call(globalThis, element, pseudo);
    if (!element.hasAttribute("data-vaul-drawer")) return style;
    // A live view, as the browser's computed style is: Radix reads it again when the sheet closes, after its state changed.
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "animationName") {
          return element.getAttribute("data-state") === "closed"
            ? "slideToBottom"
            : "slideFromBottom";
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  };
  // Radix compares the animation name with `CSS.escape`, which jsdom does not provide.
  globals.CSS = { ...realCss, escape: (value: string) => value };
  restore = () => {
    globals.getComputedStyle = realStyle;
    globals.CSS = realCss;
  };
}

export function releaseSheetExits(): void {
  restore?.();
  restore = null;
}

/** Ends the exit animation of the sheet on the page, as the browser does when it finishes (US-QS-15). */
export function endSheetExit(): void {
  const sheet = document.querySelector("[data-vaul-drawer]");
  if (!sheet) throw new Error("endSheetExit: no sheet is on the page");
  const event = new Event("animationend");
  Object.defineProperty(event, "animationName", { value: "slideToBottom" });
  act(() => {
    sheet.dispatchEvent(event);
  });
}

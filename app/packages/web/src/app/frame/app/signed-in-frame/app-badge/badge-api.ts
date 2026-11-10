// US-QS-29 · The browser's app badge (Badging API). A browser without a method gets no call and no error; a refused call is
// written to the console and shown to nobody (P-10), as the other non-fatal browser failures of the app.

/** The part of the navigator the badge uses; a browser without the Badging API omits the methods. */
export type BadgeNavigator = {
  setAppBadge?: (contents: number) => unknown;
  clearAppBadge?: () => unknown;
};

const navigatorOf = (): BadgeNavigator => (typeof navigator === "undefined" ? {} : navigator);

function refusedToConsole(cause: unknown): void {
  console.warn(
    "PflanzenDéx: the app icon could not show its number; the app works without it.",
    cause,
  );
}

/** The Badging API answers with a promise: a refusal of it is written to the console, never thrown into the page. */
function settle(result: unknown): void {
  Promise.resolve(result).catch(refusedToConsole);
}

/**
 * Shows the number on the app's icon, or clears it. Each method is called only where the browser has it, as a method of
 * the navigator (the browser needs its `this`).
 */
export function applyBadge(target: number | "clear", nav: BadgeNavigator = navigatorOf()): void {
  try {
    if (target === "clear") {
      if (typeof nav.clearAppBadge === "function") settle(nav.clearAppBadge());
    } else if (typeof nav.setAppBadge === "function") {
      settle(nav.setAppBadge(target));
    }
  } catch (cause) {
    refusedToConsole(cause);
  }
}

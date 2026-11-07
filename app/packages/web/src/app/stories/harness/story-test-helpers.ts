import { setProjectAnnotations } from "@storybook/react-vite";
import { vi } from "vitest";
import preview from "../../../../.storybook/preview";
import { SETTLE_BUDGET_MS } from "./screen-story/screen-story";

/** Tests of the page stories (US-QS-14) run the stories the way the catalog does, in jsdom. */
export function prepareStories(): void {
  setProjectAnnotations([preview]);
  // A story waits up to SETTLE_BUDGET_MS for its screen inside the test body (FR-QG-03). The test timeout must outlast
  // that wait, or the default 5 s ends a slow start before the budget does. The 5 s on top cover the checks after it.
  vi.setConfig({ testTimeout: SETTLE_BUDGET_MS + 5_000 });
  // jsdom has no matchMedia: the responsive modals and the drawer of the page frame read it.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

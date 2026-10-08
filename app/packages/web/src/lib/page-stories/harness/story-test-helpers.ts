import { setProjectAnnotations } from "@storybook/react-vite";
import preview from "../../../../.storybook/preview";

/** Tests of the page stories (US-QS-14) run the stories the way the catalog does, in jsdom. */
export function prepareStories(): void {
  setProjectAnnotations([preview]);
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

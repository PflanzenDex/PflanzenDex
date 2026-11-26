import { useLayoutEffect } from "react";
import type { Decorator } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";

/** Router of a story: a MemoryRouter at the address of the story's `path` parameter (default "/"). Layer-neutral. */
export const withRouter: Decorator = (Story, ctx) => (
  <MemoryRouter initialEntries={[String(ctx.parameters["path"] ?? "/")]}>
    <Story />
  </MemoryRouter>
);

/**
 * The text size of a phone set to 200 %: the same rule as the one-screen gate (`html { font-size: 200% !important }`), set
 * while the story shows and taken away with it.
 */
export const withText200: Decorator = (Story) => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("font-size", "200%", "important");
    return () => {
      root.style.removeProperty("font-size");
    };
  }, []);
  return <Story />;
};

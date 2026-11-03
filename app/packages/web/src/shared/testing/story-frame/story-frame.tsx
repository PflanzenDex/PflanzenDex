import type { Decorator } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";

/** Router of a story: a MemoryRouter at the address of the story's `path` parameter (default "/"). Layer-neutral. */
export const withRouter: Decorator = (Story, ctx) => (
  <MemoryRouter initialEntries={[String(ctx.parameters["path"] ?? "/")]}>
    <Story />
  </MemoryRouter>
);

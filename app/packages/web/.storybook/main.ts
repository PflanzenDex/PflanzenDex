import type { StorybookConfig } from "@storybook/react-vite";

// Living component catalog (TE-18, ADR 0007 decision 2). Stories live next to their component.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "./*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
};

export default config;

import type { StorybookConfig } from "@storybook/react-vite";

// Living component catalog (TE-18, ADR 0007 decision 2). Stories live next to their component.
// The negative fixtures of the QG-U5 conformance run are built only for its self-test, never into the catalog.
const fixtures = process.env["CONFORMANCE_FIXTURES"]
  ? ["./conformance-fixtures/*.stories.tsx"]
  : [];

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "./*.stories.@(ts|tsx)", ...fixtures],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
};

export default config;

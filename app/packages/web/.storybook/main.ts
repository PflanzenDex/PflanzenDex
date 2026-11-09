import type { StorybookConfig } from "@storybook/react-vite";

// Living component catalog (TE-18, ADR 0007 decision 2). Stories live next to their component.
// The negative fixtures of the QG-U5 conformance run are built only for its self-test, never into the catalog.
// The name of the app's worker plugin (`SERVICE_WORKER_PLUGIN` in vite.config.ts). Storybook's main loader cannot import
// the config module, so the name is repeated here.
const SERVICE_WORKER_PLUGIN = "pflanzendex-service-worker";

const fixtures = process.env["CONFORMANCE_FIXTURES"]
  ? ["./conformance-fixtures/*.stories.tsx"]
  : [];

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "./*.stories.@(ts|tsx)", ...fixtures],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
  // The catalog has no service worker (US-QS-27): the app's worker plugin in vite.config.ts is dropped here, because
  // Storybook bundles the worker entry with shared chunks and the plugin refuses a worker that imports.
  viteFinal: (vite) => ({
    ...vite,
    plugins: (vite.plugins ?? [])
      .flat()
      .filter((plugin) => !(plugin && "name" in plugin && plugin.name === SERVICE_WORKER_PLUGIN)),
  }),
};

export default config;

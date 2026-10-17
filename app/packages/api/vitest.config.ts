import { defineConfig } from "vitest/config";
import { coverageFor } from "../../tools/check/quality/coverage/coverage-config.mjs";

export default defineConfig({
  test: { globalSetup: ["./src/test-global-setup.ts"], coverage: coverageFor("api") },
});

import { defineConfig } from "vitest/config";
import { coverageFor } from "../../tools/check/quality/coverage/coverage-config.mjs";

// Tests share one database and briefly create tables: files run one after another.
export default defineConfig({
  test: {
    globalSetup: ["./src/test-global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    coverage: coverageFor("db"),
  },
});

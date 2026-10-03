import { defineConfig } from "vitest/config";
import { coverageFor } from "../../scripts/coverage-config.mjs";

// Tests share one database and briefly create tables: files run one after another.
export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20000, coverage: coverageFor("db") },
});

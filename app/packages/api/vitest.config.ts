import { defineConfig } from "vitest/config";
import { coverageFor } from "../../scripts/coverage-config.mjs";

export default defineConfig({ test: { coverage: coverageFor("api") } });

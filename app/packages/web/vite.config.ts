import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { coverageFor } from "../../scripts/coverage-config.mjs";

export default defineConfig({
  plugins: [react()],
  test: { coverage: coverageFor("web") },
});

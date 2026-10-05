import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { coverageFor } from "../../tools/check/quality/coverage/coverage-config.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { setupFiles: ["./src/lib/test-setup/test-setup.tsx"], coverage: coverageFor("web") },
});

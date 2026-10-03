import { defineConfig } from "vitest/config";

// The tests share one database and create tables temporarily, so files run one after another.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000 } });

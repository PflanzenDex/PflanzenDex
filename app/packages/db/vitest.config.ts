import { defineConfig } from "vitest/config";

// Die Tests teilen sich eine Datenbank und legen kurzzeitig Tabellen an: Dateien laufen nacheinander.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000 } });

import type { CoverageOptions } from "vitest/node";

export function readThresholds(): Record<string, Record<string, number> | null>;
export function coverageFor(pkg: string): CoverageOptions;

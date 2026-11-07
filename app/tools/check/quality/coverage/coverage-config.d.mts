import type { CoverageOptions } from "vitest/node";

export function readThresholds(): Record<string, Record<string, number> | null>;
export function coverageFor(pkg: string): CoverageOptions;
export const UNMEASURED_ENV: string;
export function unmeasuredFrom(value: string | undefined, known?: string[]): string[];

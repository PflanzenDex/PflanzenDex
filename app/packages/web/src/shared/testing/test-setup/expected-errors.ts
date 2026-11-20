import { expect, vi } from "vitest";

const causes = (value: unknown): string[] => {
  if (!(value instanceof Error)) return [];
  return [value.message, ...causes(value.cause)];
};

/**
 * Captures the console errors that a test provokes on purpose (issue 1629): a failed chunk makes React report the
 * caught error and the chunk boundary log it (P-10). Calls that carry an error with `message` (or a cause with it)
 * are kept for the assertion instead of being printed; every other call still reaches the console, so an unexpected
 * warning stays visible. Restore with `vi.restoreAllMocks()` or the returned `restore`.
 */
export function captureExpectedErrors(message: string) {
  const print = console.error.bind(console);
  const captured: unknown[][] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (args.some((a) => causes(a).some((m) => m.includes(message)))) captured.push(args);
    else print(...args);
  });
  return {
    /** The chunk boundary logged the failure with its cause, so it stays diagnosable. */
    expectBoundaryLogged() {
      expect(captured.some((args) => args[0] === "Page chunk failed to load")).toBe(true);
    },
    restore: () => spy.mockRestore(),
  };
}

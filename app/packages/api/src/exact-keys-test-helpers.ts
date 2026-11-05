import { expect } from "vitest";

/**
 * The exact keys a response may carry (QG-D2, US-QG-05). A shape lists the allowed keys of an object. A key maps to
 * `true` (its value is not inspected), to a nested shape or to `[shape]` (every item of an array). A key outside the
 * shape fails the test, and the failure names its path, e.g. `response.cards[0].ownerId`.
 *
 * Two cases would prove nothing, so they fail or are the test's own job:
 * - an array under `[shape]` that is empty fails here, with its path: the scenario must produce at least one row;
 * - a `null` nested object is not inspected. A test that expects the nested object asserts non-null itself, next to
 *   the call, so the nested keys are really checked.
 */
export type KeyShape = { readonly [key: string]: true | KeyShape | readonly [KeyShape] };

export function expectExactKeys(value: unknown, shape: KeyShape, path = "response"): void {
  if (value === null) return;
  expect(typeof value, `${path} is an object`).toBe("object");
  const keys = Object.keys(value as object).sort();
  const allowed = Object.keys(shape).sort();
  expect({ at: path, keys }).toEqual({ at: path, keys: allowed });
  for (const key of allowed) {
    const rule = shape[key];
    if (rule === true) continue;
    const item = (value as Record<string, unknown>)[key];
    if (Array.isArray(rule)) {
      expect(Array.isArray(item), `${path}.${key} is an array`).toBe(true);
      expect(
        (item as unknown[]).length,
        `${path}.${key} is empty: the scenario must produce a row`,
      ).toBeGreaterThan(0);
      (item as unknown[]).forEach((entry, i) =>
        expectExactKeys(entry, rule[0], `${path}.${key}[${i}]`),
      );
    } else {
      expectExactKeys(item, rule as KeyShape, `${path}.${key}`);
    }
  }
}

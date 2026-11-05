import { expect } from "vitest";

/**
 * The exact keys a response may carry (QG-D2, US-QG-05). A shape lists the allowed keys of an object. A key maps to
 * `true` (its value is not inspected), to a nested shape (an object, or `null`) or to `[shape]` (every item of an
 * array). A key outside the shape fails the test, and the failure names its path, e.g. `response.cards[0].ownerId`.
 */
export type KeyShape = { readonly [key: string]: true | KeyShape | readonly [KeyShape] };

export function expectExactKeys(value: unknown, shape: KeyShape, path = "response"): void {
  if (value === null) return; // a nullable object, such as `health.lastTreated`
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
      (item as unknown[]).forEach((entry, i) =>
        expectExactKeys(entry, rule[0], `${path}.${key}[${i}]`),
      );
    } else {
      expectExactKeys(item, rule as KeyShape, `${path}.${key}`);
    }
  }
}

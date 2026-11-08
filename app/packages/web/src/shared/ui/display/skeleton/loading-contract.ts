// Test support (US-QS-14, DS-56, DS-57): the contract every loading part keeps, used by the tests of its skeletons.
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect } from "vitest";

/**
 * A loading part shows its skeleton once, with its loading text, after the delay (DS-57): nothing at once, and exactly one
 * status once the delay has passed. The status text is the caller's label, so the skeleton carries the text that says so.
 */
export async function expectOneLoadingStatus(ui: ReactElement, label: string): Promise<void> {
  render(ui);
  expect(screen.queryByRole("status")).toBeNull();
  expect(await screen.findByRole("status")).toBeTruthy();
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toContain(label);
}

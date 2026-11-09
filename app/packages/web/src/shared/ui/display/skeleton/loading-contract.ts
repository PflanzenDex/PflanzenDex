// Test support (US-QS-14, DS-56, DS-57): the contract every loading part keeps, used by the tests of its skeletons.
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect, vi } from "vitest";
import { SKELETON_DELAY_MS } from "./delayed-skeleton/delayed-skeleton";

/** A slow load answers after this many ms: past the delay of DS-57, so the skeleton shows before the content (issue 1726). */
export const SLOW_LOAD_MS = SKELETON_DELAY_MS * 2;

/**
 * Makes every request of the test answer `SLOW_LOAD_MS` later (a slow load, DS-57, issue 1726). The skeleton's timer starts
 * when the part mounts, before the request starts, so its deadline comes first: the status shows, then the content.
 * Call it after the test's fake server is set up and before the render.
 */
export function delayLoads(): void {
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_LOAD_MS));
    return answer(input, init);
  });
}

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

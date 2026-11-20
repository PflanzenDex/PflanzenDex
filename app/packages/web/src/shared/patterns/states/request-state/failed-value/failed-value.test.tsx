// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FailedValue, NOT_LOADED, RetryFailedLoad } from "./failed-value";

afterEach(cleanup);

describe("FailedValue (US-QS-32, SG-STATE-03, SG-STATE-06, P-08)", () => {
  it("US-QS-32 a section whose request failed says 'Nicht geladen', never 'unbekannt'", () => {
    render(<FailedValue name="Einstellungen" onRetry={() => undefined} />);
    expect(screen.getByText(NOT_LOADED)).toBeTruthy();
    expect(NOT_LOADED).toBe("Nicht geladen");
    expect(screen.queryByText(/unbekannt/)).toBeNull();
  });

  it("US-QS-32 the retry names its section for a screen reader and runs the retry of the request", async () => {
    const onRetry = vi.fn();
    render(<FailedValue name="Einstellungen" onRetry={onRetry} />);
    const retry = screen.getByRole("button", { name: "Erneut versuchen: Einstellungen" });
    expect(retry.className).toContain("min-h-[44px]");
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("US-QS-32 the retry alone (a row that shows its value elsewhere) runs the same retry", async () => {
    const onRetry = vi.fn();
    render(<RetryFailedLoad name="Erinnerungen" onRetry={onRetry} />);
    expect(screen.queryByText(NOT_LOADED)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen: Erinnerungen" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

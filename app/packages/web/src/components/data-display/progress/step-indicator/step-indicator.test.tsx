// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StepIndicator } from "./step-indicator";

afterEach(cleanup);

describe("StepIndicator (US-QS-07, US-QS-09, 3.3.7)", () => {
  it("US-QS-07 says 'Schritt n von m' once, with the step name", () => {
    render(<StepIndicator current={2} total={4} name="Standort" />);
    expect(screen.getByText("Schritt 2 von 4: Standort")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("US-QS-07 the segments are hidden from assistive technology and the done ones are marked", () => {
    const { container } = render(<StepIndicator current={2} total={4} />);
    const segments = container.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(segments.children).toHaveLength(4);
    expect(segments.querySelectorAll("[data-done]")).toHaveLength(2);
  });

  it.each([
    [0, 3, "Schritt 1 von 3"],
    [9, 3, "Schritt 3 von 3"],
    [1, 0, "Schritt 1 von 1"],
  ])("US-QS-07 current %s of %s is clamped to '%s'", (current, total, text) => {
    render(<StepIndicator current={current} total={total} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

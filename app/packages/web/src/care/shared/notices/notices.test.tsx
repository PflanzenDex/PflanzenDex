// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { OctagonAlert } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiError } from "../../../shared/data";
import { RefusalAlert } from "./notices";

afterEach(cleanup);

function errorMark(): string {
  const { container } = render(<OctagonAlert />);
  const markup = container.querySelector("svg")?.innerHTML ?? "";
  cleanup();
  return markup;
}

const refusal: ApiError = { code: "input.invalid", text: "" };

describe("RefusalAlert of the care views (US-QS-32 · SG-COLOR-04, SG-STATE-03)", () => {
  it("US-QS-32 · SG-COLOR-04 a refusal is drawn in the error tone: red border, error mark, no warning token", () => {
    const { container } = render(<RefusalAlert error={refusal} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-destructive");
    expect(alert.className).not.toMatch(/warning/);
    expect(alert.querySelector("svg")?.innerHTML).toBe(errorMark());
    expect(container.querySelector(".bg-warning")).toBeNull();
  });

  it("US-QS-32 · P-10 the refusal takes the focus and keeps its German text", () => {
    render(<RefusalAlert error={refusal} />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).toContain(
      "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
    );
  });
});

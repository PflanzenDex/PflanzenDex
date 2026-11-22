// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OctagonAlert } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("US-QS-03 · the key conflict banner of the care views names what is saved", () => {
  const conflict: ApiError = {
    code: "idempotency.key_conflict",
    text: "x",
    conflictText: "Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.",
  };

  it("US-QS-03 the banner names the saved entry, and its one control 'Hinweis schließen' frees the key", () => {
    const onDismiss = vi.fn();
    render(<RefusalAlert error={conflict} onDismiss={onDismiss} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Gesichert ist: 12 cm am 22.11.2026. Deine Änderung ist noch nicht gesichert.",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("US-QS-03 P-10 a refusal without a dismiss control stays until the keeper acts elsewhere", () => {
    render(<RefusalAlert error={refusal} />);
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });

  it("US-QS-03 the banner wraps its text inside the window at 360 px and 200 % text, it never truncates it", () => {
    render(<RefusalAlert error={conflict} onDismiss={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("min-w-0");
    expect(alert.querySelector("div.break-words")).not.toBeNull();
  });
});

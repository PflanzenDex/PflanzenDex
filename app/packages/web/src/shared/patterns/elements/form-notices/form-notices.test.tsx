// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OctagonAlert } from "lucide-react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormNotices } from "./form-notices";

afterEach(cleanup);

// The error mark of the one error tone (SG-STATE-03): the same icon the Banner draws for `error`.
function errorMark(): string {
  const { container } = render(<OctagonAlert />);
  const markup = container.querySelector("svg")?.innerHTML ?? "";
  cleanup();
  return markup;
}

describe("FormNotices (US-QS-32 · SG-COLOR-04, SG-STATE-03)", () => {
  it("US-QS-32 · SG-COLOR-04 a refusal that names no field is drawn in the error tone: red border, error mark, no warning token", () => {
    const { container } = render(
      <FormNotices message={null} alertText="Sichern hat nicht geklappt." alertRef={createRef()} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-destructive");
    expect(alert.className).not.toMatch(/warning/);
    expect(alert.querySelector("svg")?.innerHTML).toBe(errorMark());
    expect(container.querySelector(".bg-warning")).toBeNull();
  });

  it("US-QS-32 · P-10 the refusal keeps its text and takes the focus through alertRef", () => {
    const alertRef = createRef<HTMLDivElement>();
    render(
      <FormNotices message={null} alertText="Sichern hat nicht geklappt." alertRef={alertRef} />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Sichern hat nicht geklappt.");
    expect(alertRef.current).toBe(screen.getByRole("alert"));
    expect(alertRef.current?.getAttribute("tabindex")).toBe("-1");
  });

  it("US-QS-32 · SG-STATE-03 with onRetry the refusal offers Erneut versuchen, and the click repeats the save", () => {
    const onRetry = vi.fn();
    render(
      <FormNotices
        message={null}
        alertText="Sichern hat nicht geklappt."
        alertRef={createRef()}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-STATE-03 without onRetry no retry is offered", () => {
    render(
      <FormNotices message={null} alertText="Sichern hat nicht geklappt." alertRef={createRef()} />,
    );
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
  });

  it("US-QS-32 · P-10 a save status stays a neutral status line, not an alert", () => {
    render(<FormNotices message="Gesichert." alertText={null} alertRef={createRef()} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Gesichert.");
    expect(status.className).not.toMatch(/warning|destructive/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-03 · P-10 with onDismiss a key conflict offers Hinweis schließen; without it no such control is offered", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <FormNotices
        message={null}
        alertText="Deine erste Eingabe ist gesichert. Deine Änderung ist noch nicht gesichert."
        alertRef={createRef()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(
      <FormNotices
        message={null}
        alertText="Sichern hat nicht geklappt."
        alertRef={createRef()}
        onDismiss={undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
  });
});

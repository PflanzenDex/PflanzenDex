// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { OctagonAlert } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorNotice } from "./parts";

afterEach(cleanup);

function errorMark(): string {
  const { container } = render(<OctagonAlert />);
  const markup = container.querySelector("svg")?.innerHTML ?? "";
  cleanup();
  return markup;
}

describe("ErrorNotice of the collection (US-QS-32 · SG-COLOR-04, SG-STATE-03)", () => {
  it("US-QS-32 · SG-COLOR-04 a refusal or failed load is drawn in the error tone: red border, error mark, no warning token", () => {
    const { container } = render(
      <ErrorNotice>
        <p>Die Lichtzonen konnten nicht geladen werden.</p>
      </ErrorNotice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-destructive");
    expect(alert.className).not.toMatch(/warning/);
    expect(alert.querySelector("svg")?.innerHTML).toBe(errorMark());
    expect(container.querySelector(".bg-warning")).toBeNull();
  });

  it("US-QS-32 · P-10 the notice keeps the text of its children and its action", () => {
    render(
      <ErrorNotice title="Der Haken ist nicht gespeichert.">
        <p>Der Server ist gerade nicht erreichbar.</p>
      </ErrorNotice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Der Haken ist nicht gespeichert.");
    expect(alert.textContent).toContain("Der Server ist gerade nicht erreichbar.");
  });
});

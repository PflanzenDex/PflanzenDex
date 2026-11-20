// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SaveFooter } from "./save-footer";

afterEach(cleanup);

describe("US-QS-32 · SG-TOUCH-01 the save footer of the measure form", () => {
  it("US-QS-32 · SG-TOUCH-01 keeps 8 px above its button, so the disclosure above it is 8 px from the control (DS-16)", () => {
    const { container } = render(
      <SaveFooter formId="measure-form" pending={false} photoStatus={null}>
        Messung speichern
      </SaveFooter>,
    );
    const footer = container.firstElementChild as HTMLElement;
    expect(footer.className.split(" ")).toContain("pt-2");
    expect(footer.className.split(" ")).not.toContain("py-1");
    expect(screen.getByRole("button", { name: "Messung speichern" })).toBeTruthy();
  });
});

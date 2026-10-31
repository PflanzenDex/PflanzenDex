// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SammlungHeader } from "./sammlung-header";

afterEach(cleanup);

describe("US-QS-15 the title area at a larger text size (issue 1019)", () => {
  it("US-QS-15 the header action goes below the heading when there is no room beside it: the row wraps and the title block may shrink", () => {
    render(
      <SammlungHeader
        view="plants"
        options={[
          { value: "plants", label: "Pflanzen" },
          { value: "species", label: "Arten" },
        ]}
        onChoose={vi.fn()}
        caption="3 Pflanzen"
        action={<button type="button">Ansicht</button>}
      />,
    );
    const row = screen.getByRole("button", { name: "Ansicht" }).parentElement;
    expect(row?.className).toContain("flex-wrap");
    expect(
      screen.getByRole("heading", { level: 1, name: "Sammlung" }).parentElement?.className,
    ).toContain("min-w-0");
  });
});

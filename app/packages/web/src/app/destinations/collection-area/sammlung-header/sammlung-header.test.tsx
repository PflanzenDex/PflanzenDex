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

describe("US-QS-32 the count line keeps its place while it loads (SG-STATE-02, F-0018, issue 1871)", () => {
  const header = (caption: string | null) =>
    render(
      <SammlungHeader
        view="plants"
        options={[{ value: "plants", label: "Pflanzen" }]}
        onChoose={vi.fn()}
        caption={caption}
      />,
    );

  it("US-QS-32 · SG-STATE-02 while the count loads a skeleton bar of the line's height stands under the heading", () => {
    const { container } = header(null);
    const reserve = container.querySelector("[data-caption-skeleton]");
    expect(reserve?.className).toContain("h-5");
    expect(reserve?.previousElementSibling?.tagName).toBe("H1");
  });

  it("US-QS-32 · SG-STATE-02 the loaded count takes the place of the bar", () => {
    const { container } = header("3 Pflanzen");
    expect(container.querySelector("[data-caption-skeleton]")).toBeNull();
    expect(screen.getByText("3 Pflanzen").className).toContain("text-sm");
  });
});

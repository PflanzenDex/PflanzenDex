// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentedControl } from "./segmented-control";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Pflanzen" },
  { value: "b", label: "Arten" },
];

function Host() {
  const [v, setV] = useState("a");
  return <SegmentedControl label="Ansicht" options={OPTIONS} value={v} onChange={setV} />;
}

describe("US-QS-14 segmented control", () => {
  it("US-QS-14 is a named group of toggle buttons and marks the selected one", () => {
    render(<Host />);
    expect(screen.getByRole("group", { name: "Ansicht" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pflanzen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Arten" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("US-QS-14 a click selects the segment", async () => {
    render(<Host />);
    await userEvent.click(screen.getByText("Arten"));
    expect(screen.getByRole("button", { name: "Arten" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("US-QS-14 Tab reaches every segment and Enter and Space choose it, the focus stays on it", async () => {
    render(<Host />);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanzen" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Arten" }));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Pflanzen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanzen" }));
  });

  it("US-QS-14 every segment is a 44 px target and the selected one carries a check mark besides the colour", () => {
    const { container } = render(<Host />);
    const labels = container.querySelectorAll("button");
    for (const l of labels) expect(l.className).toContain("min-h-[44px]");
    expect(labels[0]?.querySelector("svg")).not.toBeNull();
    expect(labels[1]?.querySelector("svg")).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { TreatmentsEntry } from "./today-overview";

afterEach(() => {
  cleanup();
});

const renderEntry = () =>
  render(
    <MemoryRouter>
      <TreatmentsEntry treatments={{ status: "ready", count: 2, urgent: 1 }} />
    </MemoryRouter>,
  );

describe("US-QS-32 the Behandlungen row of the treatment card keeps the warning tone (SG-COLOR-04, SG-STATE-03)", () => {
  it("US-QS-32 the row is in the warning tone: warning text and background, and no grey hover fill", () => {
    renderEntry();
    const row = screen.getByRole("button", { name: /^Behandlungen/ });
    expect(row.className).toContain("bg-warning");
    expect(row.className).toContain("text-warning-foreground");
    expect(row.className).not.toContain("hover:bg-muted");
  });

  it("US-QS-32 the word Behandlungen stays whole at a larger text size: it never breaks inside itself (issue 1113)", () => {
    renderEntry();
    const title = screen.getByText("Behandlungen", { selector: "span" });
    expect(title.className).toContain("whitespace-nowrap");
    expect(title.className).toContain("[overflow-wrap:normal]");
  });

  it("US-QS-32 the row opens the layer Behandlungen and says it opens a dialog", () => {
    renderEntry();
    const row = screen.getByRole("button", { name: /^Behandlungen/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
});

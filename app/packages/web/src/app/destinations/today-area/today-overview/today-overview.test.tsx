// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { TitleLine, TreatmentsEntry } from "./today-overview";

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

describe("US-QS-32 · F-0070 the line under the title of Heute is the summary, or the achievement notice in its place", () => {
  it("US-QS-32 · F-0070 the slot of the notice comes first and hides itself while empty; the summary hides while the slot holds the notice", () => {
    render(
      <TitleLine notice={<div data-slot="" className="peer empty:hidden" />}>
        <p>2 Gießen</p>
      </TitleLine>,
    );
    const slot = document.querySelector("[data-slot]") as HTMLElement;
    const line = screen.getByText("2 Gießen").parentElement as HTMLElement;
    expect(slot.nextElementSibling).toBe(line);
    expect(slot.className.split(" ")).toEqual(expect.arrayContaining(["peer", "empty:hidden"]));
    // The wrapper takes no room of its own: no summary, no wrapper (no gap in the column); a notice hides the summary.
    expect(line.className.split(" ")).toEqual(
      expect.arrayContaining(["empty:hidden", "peer-[:not(:empty)]:hidden"]),
    );
  });

  it("US-QS-32 · F-0070 without a notice slot the summary shows as before, in no wrapper that adds a gap", () => {
    render(
      <TitleLine>
        <p>2 Gießen</p>
      </TitleLine>,
    );
    expect(screen.getByText("2 Gießen")).toBeTruthy();
    expect(document.querySelector("[data-slot]")).toBeNull();
  });
});

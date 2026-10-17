// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NeedsView } from "./needs-view";

afterEach(cleanup);

describe("US-EQU-07 what is missing", () => {
  it("US-EQU-07 shows reason, source and next action of every item", () => {
    render(
      <NeedsView
        needs={[
          {
            id: "supply:1",
            kind: "supply_low",
            reason: "„Erde“ wird knapp.",
            source: "Vorrat unter Equipment",
            nextAction: "Kaufe Nachschub.",
          },
        ]}
      />,
    );
    expect(screen.getByText("„Erde“ wird knapp.")).toBeTruthy();
    expect(screen.getByText("Quelle: Vorrat unter Equipment")).toBeTruthy();
    expect(screen.getByText("Kaufe Nachschub.")).toBeTruthy();
  });

  it("US-EQU-07 says so when nothing is missing", () => {
    render(<NeedsView needs={[]} />);
    expect(screen.getByText(/fehlt nichts/)).toBeTruthy();
  });
});

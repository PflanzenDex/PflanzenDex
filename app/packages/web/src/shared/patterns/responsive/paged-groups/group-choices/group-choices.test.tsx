// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { GroupChoices } from "./group-choices";

afterEach(cleanup);

const choices = [
  { key: "Regal", label: "Regal", count: 2 },
  { key: "Balkon", label: "Balkon", count: 1 },
];

describe("US-QS-19 location chips on a large screen (issue 1045)", () => {
  it("US-QS-19 the chips wrap from the medium breakpoint instead of overflowing sideways without a cue", () => {
    render(
      <MemoryRouter>
        <GroupChoices label="Standorte" choices={choices} />
      </MemoryRouter>,
    );
    const group = screen.getByRole("group", { name: "Standorte" });
    expect(group.className).toContain("md:flex-wrap");
    expect(group.className).toContain("md:overflow-visible");
  });
});

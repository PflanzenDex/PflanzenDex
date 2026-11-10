// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DISTRIBUTION } from "../../../insights/distribution-test-helpers";
import { ZoneInsightRow } from "./zone-insight";

afterEach(cleanup);

describe("US-QS-19 · the insight row of the plants at 390 px", () => {
  it('US-QS-19 · the insight shrinks first: its basis is zero, so "+" stays on the row beside "Archiv (n)" (issue 1644, F19)', () => {
    render(
      <MemoryRouter>
        <ZoneInsightRow distribution={EMPTY_DISTRIBUTION.distribution} />
      </MemoryRouter>,
    );
    const insight = screen.getByRole("button", { name: /Lichtzonen ansehen/ });
    expect(insight.className).toContain("basis-0");
    expect(insight.className).not.toContain("basis-[11rem]");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { GrowthTrend } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { GrowthLines } from "./plant-growth";

afterEach(cleanup);

describe("US-QS-32 the growth line of the plant overview is primary content at 16 px (SG-TYPE-02)", () => {
  it("US-QS-32 'Wachstum' and 'Trend' are set at 16 px in the text colour, not as a grey 14 px meta line", () => {
    render(<GrowthLines growth={{ count: 0 } as GrowthTrend} />);
    const line = screen.getByText(/Wachstum:/).parentElement as HTMLElement;
    expect(line.className).toContain("text-base");
    expect(line.className).toContain("text-foreground");
    expect(line.className).not.toContain("text-sm");
  });
});

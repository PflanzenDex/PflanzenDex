// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "./viewport-mock";
import { useIsMd } from "./use-breakpoint";

afterEach(cleanup);

function Probe() {
  return <p>{useIsMd() ? "md" : "base"}</p>;
}

describe("useIsMd (US-QS-07, DS-23, DS-24)", () => {
  it("US-QS-07 · DS-23 reports the md breakpoint at 768 px and follows viewport changes", () => {
    setViewportWidth(360);
    render(<Probe />);
    expect(screen.getByText("base")).toBeTruthy();
    act(() => setViewportWidth(768));
    expect(screen.getByText("md")).toBeTruthy();
    act(() => setViewportWidth(767));
    expect(screen.getByText("base")).toBeTruthy();
  });
});

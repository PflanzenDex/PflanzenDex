// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MoreHelp } from "./more-help";

afterEach(cleanup);

describe("US-QS-24 MoreHelp", () => {
  it("US-QS-24 shows one line and the longer text behind 'Mehr erfahren'", () => {
    const { container } = render(<MoreHelp more="Lange Erklärung.">Kurz.</MoreHelp>);
    expect(screen.getByText("Kurz.")).toBeTruthy();
    expect(screen.getByText("Mehr erfahren")).toBeTruthy();
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    screen.getByText("Mehr erfahren").click();
    expect(details.open).toBe(true);
    expect(screen.getByText("Lange Erklärung.")).toBeTruthy();
  });
});

describe("US-QS-32 · SG-ICON-01 · SG-TOUCH-01 MoreHelp opener", () => {
  it("US-QS-32 · SG-ICON-01 the inline opener keeps 8 px between its text and its chevron (gap-2) and a height of 44 px (min-h-11)", () => {
    const { container } = render(<MoreHelp more="Lange Erklärung.">Kurz.</MoreHelp>);
    const tokens = (container.querySelector("summary")?.getAttribute("class") ?? "").split(" ");
    expect(tokens).toContain("inline-flex");
    expect(tokens).toContain("w-auto");
    expect(tokens).toContain("gap-2");
    expect(tokens).toContain("min-h-11");
  });
});

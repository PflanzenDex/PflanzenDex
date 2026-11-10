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

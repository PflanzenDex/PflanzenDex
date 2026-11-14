// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DisclosureSummary } from "./disclosure-summary";

afterEach(cleanup);

describe("US-QS-32 · SG-ICON-01 DisclosureSummary", () => {
  it("US-QS-32 · SG-ICON-01 the summary hides the browser's own marker and ends with a decorative chevron icon", () => {
    const { container } = render(
      <details>
        <DisclosureSummary>Mehr erfahren</DisclosureSummary>
        <p>Lange Erklärung.</p>
      </details>,
    );
    const summary = container.querySelector("summary") as HTMLElement;
    expect(summary.className).toContain("list-none");
    expect(summary.className).toContain("[&::-webkit-details-marker]:hidden");
    const icon = summary.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).toContain("size-5");
    // The chevron turns when its own details is open; the selector is direct, so a nested details does not turn it.
    expect(icon?.getAttribute("class")).toContain("[details[open]>summary>&]:rotate-180");
    expect(summary.textContent).toBe("Mehr erfahren");
  });

  it("US-QS-32 · SG-ICON-01 the caller's classes stay on the summary, and the visible text stays its name", () => {
    render(
      <details>
        <DisclosureSummary className="min-h-11 text-sm">Fotos</DisclosureSummary>
      </details>,
    );
    const summary = screen.getByText("Fotos");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.className).toContain("min-h-11");
    expect(summary.className).toContain("text-sm");
    expect(summary.className).toContain("list-none");
  });
});

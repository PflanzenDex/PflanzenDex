// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DisclosureSummary } from "./more-help.disclosure-summary";

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

describe("US-QS-32 · SG-TOUCH-01 · SG-TOUCH-02 DisclosureSummary is a full-width row", () => {
  const tokensOf = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(" ");

  it("US-QS-32 · SG-TOUCH-01 the summary is a full-width flex row of at least 44 px with a visible focus ring", () => {
    const { container } = render(
      <details>
        <DisclosureSummary>Mehr erfahren</DisclosureSummary>
      </details>,
    );
    const tokens = tokensOf(container.querySelector("summary"));
    for (const token of [
      "min-h-11",
      "w-full",
      "flex",
      "items-center",
      "cursor-pointer",
      "rounded-lg",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-ring",
    ])
      expect(tokens).toContain(token);
  });

  it("US-QS-32 · SG-ICON-01 the chevron of a row is 20 px and stands at its end", () => {
    const { container } = render(
      <details>
        <DisclosureSummary>Fotos</DisclosureSummary>
      </details>,
    );
    const icon = container.querySelector("summary > svg");
    expect(tokensOf(icon)).toContain("size-5");
    expect(tokensOf(icon)).toContain("ml-auto");
  });

  it("US-QS-32 · SG-TOUCH-01 a caller's display classes replace the row's, and an inline opener keeps its own width", () => {
    const { container } = render(
      <details>
        <DisclosureSummary className="inline-flex w-auto">Mehr erfahren</DisclosureSummary>
      </details>,
    );
    const tokens = tokensOf(container.querySelector("summary"));
    expect(tokens).toContain("inline-flex");
    expect(tokens).not.toContain("flex");
    expect(tokens).toContain("w-auto");
    expect(tokens).not.toContain("w-full");
    // The row keeps its height: an inline opener is at least 44 px high as well.
    expect(tokens).toContain("min-h-11");
  });
});

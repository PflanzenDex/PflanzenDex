// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollAccess } from "./dialog.scroll-access";

// US-QS-15 (a scroll region), WCAG 2.1.1: a region that scrolls and holds no control is a tab stop. jsdom has no layout, so the
// test gives the region a size: `content` is the height of what it holds, `shown` the height it shows.
const size = { content: 400, shown: 200 };

beforeEach(() => {
  size.content = 400;
  size.shown = 200;
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-region") ? size.content : 0;
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return this.hasAttribute("data-region") ? size.shown : 0;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Region({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<HTMLElement | null>(null);
  useScrollAccess(region);
  return (
    <section aria-labelledby="titel">
      <h2 id="titel">Pflege</h2>
      <div ref={setRegion} data-region="" data-testid="region">
        {children}
      </div>
    </section>
  );
}

describe("US-QS-15 · a scroll region without a control is a tab stop (WCAG 2.1.1)", () => {
  it("US-QS-15 a region that scrolls and holds only text becomes a tab stop, named as the layer around it", async () => {
    render(<Region>Nur Text</Region>);
    const region = screen.getByTestId("region");
    await waitFor(() => expect(region.getAttribute("tabindex")).toBe("0"));
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-labelledby")).toBe("titel");
  });

  it("US-QS-15 a region that scrolls and holds a control is no extra tab stop: the control gives the access", () => {
    render(
      <Region>
        <button>Sichern</button>
      </Region>,
    );
    expect(screen.getByTestId("region").hasAttribute("tabindex")).toBe(false);
  });

  it("US-QS-15 a region that does not scroll is no tab stop", () => {
    size.content = 100;
    render(<Region>Nur Text</Region>);
    expect(screen.getByTestId("region").hasAttribute("tabindex")).toBe(false);
  });
});

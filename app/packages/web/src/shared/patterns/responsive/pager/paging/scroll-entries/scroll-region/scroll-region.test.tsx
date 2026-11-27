// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollEntries } from "../scroll-entries";
import { SETTLE_MS } from "../use-scroll-overflow";
import { ScrollRegion } from "./scroll-region";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("US-QS-15 · SG-LIST-01 the scroll region of a page", () => {
  it("US-QS-15 is a named, focusable, marked region that does not chain its scroll to the page", () => {
    render(
      <ScrollRegion label="Freunde und Angebote">
        <p>Inhalt</p>
      </ScrollRegion>,
    );
    const region = screen.getByRole("region", { name: "Freunde und Angebote" });
    expect(region.hasAttribute("data-scroll-region")).toBe(true);
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("overflow-y-auto");
    expect(region.className).toContain("overscroll-contain");
    // It takes the room the frame leaves and keeps one row and a bit, so a frame without room scrolls instead.
    expect(region.className).toContain("flex-1");
    expect(region.className).toContain("min-h-24");
  });

  it("US-QS-15 a list in it ends with the marker when the list is longer than the region, and has no row of its own when it fits", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          this.callback();
        }
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(200);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const rows = Array.from(this.parentElement?.children ?? []);
      return { top: 0, bottom: (rows.indexOf(this) + 1) * 60 } as DOMRect;
    });
    const friends = (n: number) => Array.from({ length: n }, (_, i) => `Freund ${i + 1}`);
    const view = (items: string[]) => (
      <MemoryRouter>
        <ScrollRegion label="Freunde">
          <ScrollEntries items={items} pageSize={10} label="Liste" renderItem={(t) => t} />
        </ScrollRegion>
      </MemoryRouter>
    );
    const wait = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 60));
    const first = render(view(friends(2)));
    await wait();
    expect(document.querySelector("[data-list-end]")).toBeNull();
    first.unmount();
    render(view(friends(9)));
    expect(await screen.findByText("Das waren alle 9")).toBeTruthy();
  });
});

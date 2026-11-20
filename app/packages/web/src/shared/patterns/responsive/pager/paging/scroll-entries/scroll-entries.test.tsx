// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { Pager } from "../../pager";
import type { PagerPaging } from "../paging";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

const plants = Array.from({ length: 20 }, (_, i) => `Pflanze ${i + 1}`);

function list(items: readonly string[], paging?: PagerPaging) {
  return (
    <MemoryRouter>
      <Pager
        items={items}
        pageSize={4}
        label="Pflanzen"
        renderItem={(t) => t}
        {...(paging ? { paging } : {})}
      />
    </MemoryRouter>
  );
}

function serverPaging(total: number, onMore: () => void): PagerPaging {
  return {
    total,
    loading: false,
    onMore,
    onRetry: vi.fn(),
    loadingText: "Pflanzen werden geladen …",
    retryText: "Erneut versuchen",
  };
}

/** A fake IntersectionObserver: `reach` reports that the end of the list is on screen. */
function stubIntersection() {
  const active = new Set<IntersectionObserverCallback>();
  class FakeObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {
      active.add(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      active.delete(this.callback);
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return {
    reach: () =>
      act(() => {
        for (const callback of active) {
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
        }
      }),
  };
}

describe("US-QS-32 · SG-LIST-01 a list on a phone scrolls instead of paging", () => {
  it("US-QS-32 · SG-LIST-01 on a phone every entry is on the page and there is no Weiter button", () => {
    setViewportWidth(360);
    render(list(plants));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zurück" })).toBeNull();
  });

  it("US-QS-32 · SG-LIST-01 on a phone a fit list is marked like a paged one, so its sheet or layer takes its full height", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <Pager items={plants} pageSize={4} label="Pflanzen" renderItem={(t) => t} fit />
      </MemoryRouter>,
    );
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
    expect(list.className).toContain("flex-1");
  });

  it("US-QS-32 · SG-LIST-01 from 768 px the list still pages by its size", () => {
    setViewportWidth(768);
    render(list(plants));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Weiter" })).toBeTruthy();
  });

  it("US-QS-32 · SG-LIST-01 on a phone a server list asks for the next page when its end shows", () => {
    setViewportWidth(360);
    const observer = stubIntersection();
    const onMore = vi.fn();
    render(list(plants.slice(0, 8), serverPaging(20, onMore)));
    expect(onMore).not.toHaveBeenCalled();
    observer.reach();
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-LIST-01 without an IntersectionObserver a server list still asks for its next page", () => {
    setViewportWidth(360);
    const onMore = vi.fn();
    render(list(plants.slice(0, 8), serverPaging(20, onMore)));
    expect(onMore).toHaveBeenCalled();
  });
});

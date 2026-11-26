// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { LayerScope } from "@/shared/ui/layer-scope";
import { Pager } from "../../pager";
import type { PagerPaging } from "../paging";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

const plants = Array.from({ length: 20 }, (_, i) => `Pflanze ${i + 1}`);

type ListOptions = { resetKey?: string; fit?: boolean };

function list(items: readonly string[], paging?: PagerPaging, more: ListOptions = {}) {
  return (
    <MemoryRouter>
      <Pager
        items={items}
        pageSize={4}
        label="Pflanzen"
        renderItem={(t) => t}
        {...(paging ? { paging } : {})}
        {...(more.resetKey !== undefined ? { resetKey: more.resetKey } : {})}
        {...(more.fit ? { fit: true } : {})}
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

/** A fake IntersectionObserver: `reach` reports that the end of the list is on screen; `roots` are the roots it was made with. */
function stubIntersection() {
  const active = new Set<IntersectionObserverCallback>();
  const roots: (Element | Document | null | undefined)[] = [];
  class FakeObserver {
    constructor(
      private readonly callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      active.add(callback);
      roots.push(options?.root);
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
    roots,
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

  it("US-QS-32 · SG-LIST-01 on a phone a fit list is marked like a paged one, so the frame around it passes the height down", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <Pager items={plants} pageSize={4} label="Pflanzen" renderItem={(t) => t} fit />
      </MemoryRouter>,
    );
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
    expect(list.className).toContain("flex-1");
    // The room the frame leaves can be none (200 % text): the list keeps one row and a bit, then the frame scrolls.
    expect(list.className).toContain("min-h-24");
    expect(list.className).not.toContain("min-h-0");
  });

  it("US-QS-15 · SG-LIST-01 inside a sheet, a dialog or a pane a list never pages, at any width: it is the content of the layer", () => {
    for (const width of [360, 768, 1280]) {
      setViewportWidth(width);
      const { unmount } = render(<LayerScope.Provider value>{list(plants)}</LayerScope.Provider>);
      expect(screen.getAllByRole("listitem")).toHaveLength(plants.length);
      expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
      const box = screen.getByRole("list", { name: "Pflanzen" });
      // The layer scrolls its content: the list takes no marker of a scroll region, no tab stop and no Pager marker of the gate.
      expect(box.hasAttribute("tabindex")).toBe(false);
      expect(box.hasAttribute("data-page-fit")).toBe(false);
      expect(box.parentElement?.hasAttribute("data-pager")).toBe(false);
      unmount();
    }
  });

  it("US-QS-15 · SG-LIST-01 from 768 px the list of a page scrolls too: every entry, no pages", () => {
    for (const width of [768, 1024, 1920]) {
      setViewportWidth(width);
      const view = render(list(plants));
      expect(screen.getAllByRole("listitem")).toHaveLength(plants.length);
      expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
      view.unmount();
    }
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

  it("US-QS-32 · SG-LIST-01 a failed part shows its note with the retry and nothing is asked for again", () => {
    setViewportWidth(360);
    const onMore = vi.fn();
    const failed = { ...serverPaging(20, onMore), failure: "Konnte nicht geladen werden" };
    render(list(plants.slice(0, 8), failed));
    // The row of US-QS-15 says what failed in its own sentence and names the cause the caller knows after it.
    expect(screen.getByRole("alert").textContent).toBe(
      "Der Rest konnte nicht geladen werden. Konnte nicht geladen werden",
    );
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(onMore).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-LIST-01 a retry that worked takes the note away and puts the focus on the list", () => {
    setViewportWidth(360);
    const onRetry = vi.fn();
    const failed = {
      ...serverPaging(12, vi.fn()),
      failure: "Konnte nicht geladen werden",
      onRetry,
    };
    const view = render(list(plants.slice(0, 8), failed));
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    view.rerender(list(plants.slice(0, 12), serverPaging(12, vi.fn())));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("list", { name: "Pflanzen" }));
  });

  it("US-QS-32 · SG-LIST-01 the second part is asked for once the first has arrived and the end shows again", () => {
    setViewportWidth(360);
    const observer = stubIntersection();
    const onMore = vi.fn();
    const view = render(list(plants.slice(0, 8), serverPaging(20, onMore)));
    observer.reach();
    expect(onMore).toHaveBeenCalledTimes(1);
    view.rerender(list(plants.slice(0, 12), serverPaging(20, onMore)));
    expect(onMore).toHaveBeenCalledTimes(1);
    observer.reach();
    expect(onMore).toHaveBeenCalledTimes(2);
  });

  it("US-QS-32 · SG-LIST-01 a changed filter forgets what was asked for, so no skeletons stand for the old part", () => {
    setViewportWidth(360);
    const observer = stubIntersection();
    const onMore = vi.fn();
    const paging = { ...serverPaging(20, onMore), placeholder: <span>Karte</span> };
    const holes = () => document.querySelectorAll('li[aria-hidden="true"]').length;
    const view = render(list(plants.slice(0, 8), paging, { resetKey: "alle" }));
    observer.reach();
    expect(holes()).toBe(4);
    view.rerender(list(plants.slice(0, 4), paging, { resetKey: "Wohnzimmer" }));
    expect(holes()).toBe(0);
    observer.reach();
    expect(onMore).toHaveBeenCalledTimes(2);
  });

  it("US-QS-32 · SG-LIST-01 · SG-LIST-02 a fit list scrolls in its own box, so it is a tab stop and its rows keep their height", () => {
    setViewportWidth(360);
    render(list(plants, undefined, { fit: true }));
    expect(screen.getByRole("list", { name: "Pflanzen" }).getAttribute("tabindex")).toBe("0");
    for (const row of screen.getAllByRole("listitem")) expect(row.className).toContain("shrink-0");
  });

  it("US-QS-32 · SG-LIST-01 a list that does not scroll in its own box is no tab stop", () => {
    setViewportWidth(360);
    render(list(plants));
    expect(screen.getByRole("list", { name: "Pflanzen" }).hasAttribute("tabindex")).toBe(false);
  });

  it("US-QS-32 · SG-LIST-01 the end of a fit list is watched inside the list, the end of any other against the window", () => {
    setViewportWidth(360);
    const fit = stubIntersection();
    const view = render(list(plants.slice(0, 8), serverPaging(20, vi.fn()), { fit: true }));
    expect(fit.roots.at(-1)).toBe(screen.getByRole("list", { name: "Pflanzen" }));
    view.unmount();
    const page = stubIntersection();
    render(list(plants.slice(0, 8), serverPaging(20, vi.fn())));
    expect(page.roots.at(-1) ?? null).toBeNull();
  });
});

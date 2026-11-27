// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { Pager } from "../../../pager";
import type { PagerPaging } from "../../paging";
import { SKELETON_DELAY_MS, STATUS_HOLD_MS } from "@/shared/ui/skeleton.delayed";
import { SETTLE_MS } from "../use-scroll-overflow";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

const plants = Array.from({ length: 30 }, (_, i) => `Pflanze ${i + 1}`);

function paging(over: Partial<PagerPaging> = {}): PagerPaging {
  return {
    total: 30,
    loading: false,
    onMore: vi.fn(),
    onRetry: vi.fn(),
    loadingText: "Pflanzen werden geladen …",
    retryText: "Nochmal",
    ...over,
  };
}

function list(items: readonly string[], more?: PagerPaging, resetKey = "alle") {
  return (
    <MemoryRouter>
      <Pager
        items={items}
        pageSize={10}
        label="Pflanzen"
        renderItem={(t) => t}
        fit
        resetKey={resetKey}
        {...(more ? { paging: more } : {})}
      />
    </MemoryRouter>
  );
}

/** A box of `box` px with rows of `row` px: jsdom has no layout, so the measure of the end reads these. */
function stubLayout(box = 300, row = 60) {
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
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(box);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const rows = Array.from(this.parentElement?.children ?? []);
    const bottom = this.tagName === "UL" ? box : (rows.indexOf(this) + 1) * row;
    return { top: 0, bottom } as DOMRect;
  });
}

/** Lets the settle of the measure pass. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 60));
  });

const marker = () => screen.queryByText(/^Das waren alle/);

describe("US-QS-15 · SG-LIST-01 the loader row", () => {
  it("US-QS-15 · SG-LIST-01 shows a spinner without visible text and a screen reader hears 'Weitere werden geladen …'", async () => {
    setViewportWidth(360);
    render(list(plants.slice(0, 8), paging({ loading: true })));
    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Weitere werden geladen …");
    // The only text is the screen reader text: nothing the eye can read, only the spinner drawing.
    const row = status.closest("li") as HTMLElement;
    expect(row.querySelector(".sr-only")?.textContent).toBe("Weitere werden geladen …");
    expect(row.querySelector("svg")).not.toBeNull();
    expect(row.textContent).toBe("Weitere werden geladen …");
  });

  it("US-QS-15 · SG-LIST-01 takes no focus: no control, no tab stop", async () => {
    setViewportWidth(360);
    render(list(plants.slice(0, 8), paging({ loading: true })));
    const row = (await screen.findByRole("status")).closest("li") as HTMLElement;
    expect(row.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
    expect(row.hasAttribute("tabindex")).toBe(false);
  });

  it("US-QS-15 · SG-LIST-01 stands still under reduced motion", async () => {
    setViewportWidth(360);
    render(list(plants.slice(0, 8), paging({ loading: true })));
    const row = (await screen.findByRole("status")).closest("li") as HTMLElement;
    const moving = Array.from(row.querySelectorAll("g[class*='animate-']"));
    expect(moving.length).toBeGreaterThan(0);
    for (const part of moving)
      expect(part.getAttribute("class")).toContain("motion-reduce:animate-none");
  });

  it("US-QS-15 · SG-LIST-01 with a skeleton per missing entry only the status stays: no spinner beside the skeletons", async () => {
    setViewportWidth(360);
    const withSkeleton = paging({ loading: true, placeholder: <span>Karte</span> });
    render(list(plants.slice(0, 8), withSkeleton));
    const status = await screen.findByText("Weitere werden geladen …");
    expect(status.closest("li")?.className).toContain("sr-only");
    expect(status.closest("li")?.querySelector("svg")).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 is not there when no part is missing, and there is no 'Mehr laden' button in any state", async () => {
    setViewportWidth(360);
    const view = render(list(plants.slice(0, 8), paging({ loading: true })));
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /mehr laden/i })).toBeNull();
    view.rerender(list(plants, paging()));
    // The loader stays a moment once shown (DS-57, D5), so it does not flash; then it goes.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("US-QS-15 · SG-LIST-01 the end marker 'Das waren alle n'", () => {
  it("US-QS-15 · SG-LIST-01 a known count and a list longer than its box end with the marker, plain text and no control", async () => {
    setViewportWidth(360);
    stubLayout();
    render(list(plants, paging()));
    const text = await screen.findByText("Das waren alle 30");
    const row = text.closest("li") as HTMLElement;
    expect(row.parentElement?.lastElementChild).toBe(row);
    expect(row.querySelector("a, button, [tabindex]")).toBeNull();
    expect(row.textContent).not.toMatch(/\.$/);
  });

  it("US-QS-15 · SG-LIST-01 an unknown count shows no marker", async () => {
    setViewportWidth(360);
    stubLayout();
    render(list(plants, paging({ total: undefined })));
    await settle();
    expect(marker()).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a short list that fits without scrolling shows no marker", async () => {
    setViewportWidth(360);
    stubLayout();
    render(list(plants.slice(0, 3), paging({ total: 3 })));
    await settle();
    expect(marker()).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a filtered list ends with the filtered count, in the same form", async () => {
    setViewportWidth(360);
    stubLayout();
    const view = render(list(plants, paging(), "alle"));
    await screen.findByText("Das waren alle 30");
    view.rerender(list(plants.slice(0, 9), paging({ total: 9 }), "Wohnzimmer"));
    await screen.findByText("Das waren alle 9");
    expect(screen.queryByText("Das waren alle 30")).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a list that is not all loaded yet shows no marker", async () => {
    setViewportWidth(360);
    stubLayout();
    render(list(plants.slice(0, 20), paging({ total: 30 })));
    await settle();
    expect(marker()).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a list without paging in its own box ends with the marker when it is longer than the box: the count is the entries", async () => {
    setViewportWidth(1024);
    stubLayout();
    render(list(plants.slice(0, 12)));
    const text = await screen.findByText("Das waren alle 12");
    const row = text.closest("li") as HTMLElement;
    expect(row.parentElement?.lastElementChild).toBe(row);
    expect(row.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a short list without paging that fits its box has no row of its own, so no height is added", async () => {
    setViewportWidth(1024);
    stubLayout();
    render(list(plants.slice(0, 3)));
    await settle();
    expect(screen.getByRole("list", { name: "Pflanzen" }).children).toHaveLength(3);
    expect(document.querySelector("[data-list-end]")).toBeNull();
    expect(marker()).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 a list without paging in a region of a page ends with the marker too, and a list in the page itself measures nothing", async () => {
    stubLayout();
    const measured = vi.fn();
    const Observer = globalThis.ResizeObserver;
    vi.stubGlobal(
      "ResizeObserver",
      class extends Observer {
        constructor(callback: ResizeObserverCallback) {
          super(callback);
          measured();
        }
      },
    );
    const plain = (items: readonly string[]) => (
      <MemoryRouter>
        <Pager items={items} pageSize={10} label="Pflanzen" renderItem={(t) => t} />
      </MemoryRouter>
    );
    // In the page (`main`) a page that scrolls must not grow by a row: nothing is measured, nothing is added.
    const page = render(<main>{plain(plants.slice(0, 12))}</main>);
    await settle();
    expect(document.querySelector("[data-list-end]")).toBeNull();
    expect(measured).not.toHaveBeenCalled();
    page.unmount();
    // In a marked scroll region the end of the list is the end of what scrolls.
    render(<div data-scroll-region="">{plain(plants.slice(0, 12))}</div>);
    await screen.findByText("Das waren alle 12");
    expect(measured).toHaveBeenCalled();
  });

  it("US-QS-15 · SG-LIST-01 without a ResizeObserver nothing is measured, so no marker shows", async () => {
    setViewportWidth(360);
    render(list(plants, paging()));
    await settle();
    expect(marker()).toBeNull();
  });

  it("US-QS-15 · SG-LIST-01 the count is written the German way", async () => {
    setViewportWidth(360);
    stubLayout();
    const many = Array.from({ length: 1234 }, (_, i) => `Pflanze ${i + 1}`);
    render(list(many, paging({ total: 1234 })));
    await screen.findByText("Das waren alle 1.234");
  });
});

describe("US-QS-15 · SG-LIST-01 the retry row of a failed part (P-10)", () => {
  it("US-QS-15 · SG-LIST-01 says what failed, keeps the loaded entries and offers 'Erneut versuchen'", () => {
    setViewportWidth(360);
    const onMore = vi.fn();
    render(list(plants.slice(0, 8), paging({ failure: "Keine Verbindung.", onMore, total: 30 })));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Der Rest konnte nicht geladen werden. Keine Verbindung.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText("Pflanze 8")).toBeTruthy();
    expect(onMore).not.toHaveBeenCalled();
  });

  it("US-QS-15 · SG-LIST-01 without a known cause the row holds the sentence alone", () => {
    setViewportWidth(360);
    render(list(plants.slice(0, 8), paging({ failure: "" })));
    expect(screen.getByRole("alert").textContent).toBe("Der Rest konnte nicht geladen werden.");
  });

  it("US-QS-15 · SG-LIST-01 the button retries once and the sentence stands above it", () => {
    setViewportWidth(360);
    const onRetry = vi.fn();
    render(list(plants.slice(0, 8), paging({ failure: "", onRetry })));
    const button = screen.getByRole("button", { name: "Erneut versuchen" });
    const sentence = screen.getByRole("alert");
    // Stacked: the sentence comes first in a column, so at 200 % text the button never squeezes it (story RetryRowAt200).
    expect(
      sentence.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(button.closest("li")?.className).toContain("flex-col");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("US-QS-15 · SG-LIST-01 a retry that worked takes the row away and puts the focus on the list", () => {
    setViewportWidth(360);
    const failed = paging({ failure: "", total: 12 });
    const view = render(list(plants.slice(0, 8), failed));
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(list(plants.slice(0, 12), paging({ total: 12 })));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("list", { name: "Pflanzen" }));
  });

  it("US-QS-15 · SG-LIST-01 there is no 'Mehr laden' button next to the retry", () => {
    setViewportWidth(360);
    render(list(plants.slice(0, 8), paging({ failure: "" })));
    expect(screen.queryByRole("button", { name: /mehr laden/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("FR-BES-23 · P-10 the retry row is there at once after a failed part (issue 2591)", () => {
  it("FR-BES-23 · P-10 a part that fails after its loader showed puts the retry row in at once, and a tap starts exactly one request", () => {
    vi.useFakeTimers();
    try {
      setViewportWidth(360);
      const onRetry = vi.fn();
      const view = render(list(plants.slice(0, 8), paging({ loading: true, onRetry })));
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS + 50);
      });
      expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
      view.rerender(list(plants.slice(0, 8), paging({ failure: "", onRetry })));
      // No hold: the loader does not keep the place of the retry row.
      const button = screen.getByRole("button", { name: "Erneut versuchen" });
      fireEvent.click(button);
      expect(onRetry).toHaveBeenCalledTimes(1);
      act(() => {
        vi.advanceTimersByTime(STATUS_HOLD_MS * 2);
      });
      expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBe(button);
    } finally {
      vi.useRealTimers();
    }
  });

  it("FR-BES-23 · P-10 a part that is on its way still shows its loader after the delay", () => {
    vi.useFakeTimers();
    try {
      setViewportWidth(360);
      render(list(plants.slice(0, 8), paging({ loading: true })));
      act(() => {
        vi.advanceTimersByTime(SKELETON_DELAY_MS);
      });
      expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

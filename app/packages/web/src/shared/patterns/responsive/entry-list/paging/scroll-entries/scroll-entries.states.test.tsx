// @vitest-environment jsdom
import type { ReactElement } from "react";
import { act, cleanup, render as plainRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayerScope } from "@/shared/ui/layer-scope";
import { ScrollEntries } from "./scroll-entries";
import type { EntriesPaging } from "../paging";

afterEach(cleanup);

/** What a sheet, a dialog or a pane provides for what it holds (`LayerScope`). */
const inLayer = (ui: ReactElement) =>
  plainRender(<LayerScope.Provider value>{ui}</LayerScope.Provider>);

const items = Array.from({ length: 7 }, (_, i) => `Pflanze ${i + 1}`);

function Example({ fit = false }: { fit?: boolean }) {
  return (
    <MemoryRouter>
      <ScrollEntries items={items} pageSize={3} fit={fit} label="Pflanzen" renderItem={(t) => t} />
    </MemoryRouter>
  );
}

const paging = (loading: boolean, failure?: string, placeholder = true): EntriesPaging => ({
  total: 5,
  loading,
  ...(failure === undefined ? {} : { failure }),
  onMore: vi.fn(),
  onRetry: vi.fn(),
  loadingText: "Pflanzen werden geladen …",
  retryText: "Erneut versuchen",
  ...(placeholder ? { placeholder: <span data-testid="tile-skeleton" /> } : {}),
});

const pending = (p: EntriesPaging) =>
  plainRender(
    <MemoryRouter>
      <ScrollEntries
        items={["a"]}
        pageSize={3}
        label="Pflanzen"
        paging={p}
        renderItem={(item) => <span>{item}</span>}
      />
    </MemoryRouter>,
  );

describe("US-QS-32 a part on its way shows its entries' skeletons, not an empty frame (SG-STATE-02, F-0124, issue 1913)", () => {
  it("US-QS-32 · SG-STATE-02 the missing entries get skeletons, the list is busy and the note is read out only", () => {
    vi.useFakeTimers();
    try {
      pending(paging(true));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      const ul = screen.getByRole("list", { name: "Pflanzen" });
      expect(ul.getAttribute("aria-busy")).toBe("true");
      expect(screen.getAllByTestId("tile-skeleton")).toHaveLength(3);
      // The loader row says "Weitere werden geladen …" to a screen reader and shows no text (SG-STATE-02).
      const status = screen.getByText("Weitere werden geladen …");
      expect(status.closest("[data-list-end]")?.className).toContain("sr-only");
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · P-10 a failed part shows no skeletons: the failure and its retry stand", () => {
    pending(paging(false, "Nicht geladen"));
    expect(screen.queryAllByTestId("tile-skeleton")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Pflanzen" }).getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-32 without a skeleton the list is not busy and the loader row still says what is loading", () => {
    vi.useFakeTimers();
    try {
      pending(paging(true, undefined, false));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.queryAllByTestId("tile-skeleton")).toHaveLength(0);
      expect(screen.getByRole("list", { name: "Pflanzen" }).getAttribute("aria-busy")).toBeNull();
      expect(screen.getByText("Weitere werden geladen …")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("US-QS-32 a row keeps its content height: the rows of a list never shrink (issue 2315)", () => {
  it("US-QS-32 every row of a fit list on a page is a shrink-0 item, so a squeezed list cannot collapse it to its borders (issue 2315)", () => {
    plainRender(<Example fit />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(items.length);
    for (const row of rows) expect(row.classList.contains("shrink-0")).toBe(true);
  });

  it("US-QS-32 every row of a list in a layer is a shrink-0 item too (issue 2315)", () => {
    inLayer(<Example />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(items.length);
    for (const row of rows) expect(row.classList.contains("shrink-0")).toBe(true);
  });

  it("US-QS-32 the placeholders of a part on its way are shrink-0 items as well (issue 2315)", () => {
    pending(paging(true));
    const ul = screen.getByRole("list", { name: "Pflanzen" });
    const placeholders = Array.from(ul.children).filter(
      (li) => li.getAttribute("aria-hidden") === "true",
    );
    expect(placeholders.length).toBeGreaterThan(0);
    for (const li of Array.from(ul.children)) expect(li.classList.contains("shrink-0")).toBe(true);
  });
});

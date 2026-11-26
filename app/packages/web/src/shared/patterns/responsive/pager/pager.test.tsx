// @vitest-environment jsdom
import type { ReactElement } from "react";
import { act, cleanup, render as plainRender, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pager } from "./pager";
import { LayerScope } from "@/shared/ui/layer-scope";
import { setViewportWidth } from "@/shared/testing/viewport-mock";

afterEach(cleanup);
beforeEach(() => setViewportWidth(1024));

/** What a sheet, a dialog or a pane provides for what it holds (`LayerScope`). */
const inLayer = (ui: ReactElement) =>
  plainRender(<LayerScope.Provider value>{ui}</LayerScope.Provider>);

const items = Array.from({ length: 7 }, (_, i) => `Pflanze ${i + 1}`);
const WIDTHS = [360, 768, 1024, 1920];

function Where() {
  const { search } = useLocation();
  return <span data-testid="address">{search}</span>;
}

const address = () => screen.getByTestId("address").textContent;
const entries = () => screen.getAllByRole("listitem").map((li) => li.textContent);
/** The controls that page: none on a scrolling list. */
const pageControls = () => screen.queryAllByRole("button", { name: /^(Zurück|Weiter)$/ });

function Example({ at = "/", fit = false }: { at?: string; fit?: boolean }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager items={items} pageSize={3} fit={fit} label="Pflanzen" renderItem={(t) => t} />
      <Where />
    </MemoryRouter>
  );
}

describe("US-QS-15 a list on a page scrolls at every width (SG-LIST-01)", () => {
  for (const width of WIDTHS) {
    it(`US-QS-15 · SG-LIST-01 at ${width} px the list of a page holds every entry and no Zurück, Weiter or "Seite n von m"`, () => {
      setViewportWidth(width);
      plainRender(<Example />);
      expect(entries()).toEqual(items);
      expect(pageControls()).toHaveLength(0);
      expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    });
  }

  it("US-QS-15 · issue 2417 the list of a page carries the data-pager marker at every width", () => {
    for (const width of WIDTHS) {
      setViewportWidth(width);
      const page = plainRender(<Example />);
      expect(document.querySelector("[data-pager]")).not.toBeNull();
      page.unmount();
    }
  });

  it("US-QS-15 · SG-NAV-02 a scrolling list writes no position into the address, and an old `?from=` is stripped at a tablet width too", () => {
    plainRender(<Example at="/?from=3&x=1" />);
    expect(address()).toBe("?x=1");
    expect(entries()).toEqual(items);
  });

  it("US-QS-23 · SG-NAV-02 a list with an address part of its own strips that old part and keeps the others", () => {
    plainRender(
      <MemoryRouter initialEntries={["/?vfrom=3&part=a"]}>
        <Pager items={items} pageSize={3} label="Verlauf" param="vfrom" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?part=a");
    expect(entries()).toEqual(items);
  });
});

describe("US-QS-15 a list in a layer is the content of the layer, never pages (SG-LIST-01, issue 2418)", () => {
  for (const width of WIDTHS) {
    it(`US-QS-15 · SG-LIST-01 in a sheet, a dialog or a pane at ${width} px the list holds every entry and no Zurück, Weiter or "Seite n von m"`, () => {
      setViewportWidth(width);
      inLayer(<Example />);
      expect(entries()).toEqual(items);
      expect(pageControls()).toHaveLength(0);
      expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    });
  }

  it("US-QS-15 · SG-LIST-01 a list in a layer takes no fit and no scroll box of its own, and carries no data-pager marker", () => {
    inLayer(<Example fit />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.hasAttribute("data-page-fit")).toBe(false);
    expect(list.hasAttribute("tabindex")).toBe(false);
    expect(document.querySelector("[data-pager]")).toBeNull();
  });

  it("US-QS-15 · SG-NAV-02 the old position of a list in a layer (`?lfrom=`, `?lpage=`) is stripped, the layer stays open", () => {
    inLayer(<Example at="/?sheet=plant-e1&lfrom=3&lpage=2&from=6" />);
    expect(address()).toBe("?sheet=plant-e1");
    expect(entries()).toEqual(items);
  });

  it("US-QS-15 the view of a list follows the layer around it, not the width: it scrolls on the page and in a layer", () => {
    setViewportWidth(1024);
    const page = plainRender(<Example />);
    expect(entries()).toHaveLength(items.length);
    page.unmount();
    inLayer(<Example />);
    expect(entries()).toHaveLength(items.length);
  });
});

describe("US-QS-32 a part on its way shows its entries' skeletons, not an empty frame (SG-STATE-02, F-0124, issue 1913)", () => {
  const paging = (loading: boolean, failure?: string, placeholder = true) => ({
    total: 5,
    loading,
    ...(failure === undefined ? {} : { failure }),
    onMore: vi.fn(),
    onRetry: vi.fn(),
    loadingText: "Pflanzen werden geladen …",
    retryText: "Erneut versuchen",
    ...(placeholder ? { placeholder: <span data-testid="tile-skeleton" /> } : {}),
  });
  const list = (p: ReturnType<typeof paging>) =>
    plainRender(
      <MemoryRouter>
        <Pager
          items={["a"]}
          pageSize={3}
          label="Pflanzen"
          paging={p}
          renderItem={(item) => <span>{item}</span>}
        />
      </MemoryRouter>,
    );

  it("US-QS-32 · SG-STATE-02 the missing entries get skeletons, the list is busy and the note is read out only", () => {
    vi.useFakeTimers();
    try {
      list(paging(true));
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
    list(paging(false, "Nicht geladen"));
    expect(screen.queryAllByTestId("tile-skeleton")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Pflanzen" }).getAttribute("aria-busy")).toBeNull();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-32 without a skeleton the list is not busy and the loader row still says what is loading", () => {
    vi.useFakeTimers();
    try {
      list(paging(true, undefined, false));
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
    plainRender(
      <MemoryRouter>
        <Pager
          items={["a"]}
          pageSize={3}
          label="Pflanzen"
          paging={{
            total: 5,
            loading: true,
            onMore: vi.fn(),
            onRetry: vi.fn(),
            loadingText: "Pflanzen werden geladen …",
            retryText: "Erneut versuchen",
            placeholder: <span data-testid="tile-skeleton" />,
          }}
          renderItem={(item) => <span>{item}</span>}
        />
      </MemoryRouter>,
    );
    const ul = screen.getByRole("list", { name: "Pflanzen" });
    const placeholders = Array.from(ul.children).filter(
      (li) => li.getAttribute("aria-hidden") === "true",
    );
    expect(placeholders.length).toBeGreaterThan(0);
    for (const li of Array.from(ul.children)) expect(li.classList.contains("shrink-0")).toBe(true);
  });
});

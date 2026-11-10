// @vitest-environment jsdom
import { StrictMode, useEffect, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAYER_PARAM, Pager } from "./pager";

afterEach(cleanup);

const items = Array.from({ length: 7 }, (_, i) => `Pflanze ${i + 1}`);

function Where() {
  const { search } = useLocation();
  return <span data-testid="address">{search}</span>;
}

const address = () => screen.getByTestId("address").textContent;
const entries = () => screen.getAllByRole("listitem").map((li) => li.textContent);

function Example({ at = "/", resetKey = "a" }: { at?: string; resetKey?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager
        items={items}
        pageSize={3}
        label="Pflanzen"
        resetKey={resetKey}
        renderItem={(t) => t}
      />
      <Where />
    </MemoryRouter>
  );
}

function swipe(target: Element, from: number, to: number) {
  fireEvent.pointerDown(target, { clientX: from, clientY: 100 });
  fireEvent.pointerUp(target, { clientX: to, clientY: 100 });
}

describe("Pager (US-QS-15)", () => {
  it("US-QS-15 · FR-BES-23 shows whole entries from the first entry the address names, and the position", () => {
    render(<Example at="/?from=3" />);
    expect(entries()).toEqual(["Pflanze 4", "Pflanze 5", "Pflanze 6"]);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
  });

  it("US-QS-15 · FR-BES-23 an entry past the end shows the last page and the address follows", () => {
    render(<Example at="/?from=99" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    expect(address()).toBe("?from=6");
  });

  it("US-QS-15 Weiter and Zurück change the page and are disabled at the ends", async () => {
    render(<Example />);
    const back = screen.getByRole("button", { name: "Zurück" });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    expect(address()).toBe("?from=3");
    await userEvent.click(back);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 announces the position politely", () => {
    render(<Example />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("US-QS-15 · FR-BES-23 a changed filter starts at the first entry", () => {
    const { rerender } = render(<Example at="/?from=6" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    rerender(<Example at="/?from=6" resetKey="b" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
    expect(address()).toBe("");
  });

  it("US-QS-15 swiping left goes on, swiping right goes back, a short move does nothing", () => {
    render(<Example />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    swipe(list, 200, 190);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
    swipe(list, 200, 100);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    swipe(list, 100, 200);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 · issue 1045 a disabled page button is neutral, not the faded outline green", () => {
    render(<Example />);
    const back = screen.getByRole("button", { name: "Zurück" });
    expect(back.hasAttribute("disabled")).toBe(true);
    expect(back.className).toContain("disabled:text-muted-foreground");
    expect(back.className).toContain("disabled:opacity-100");
  });

  it("US-QS-24 the page caption never breaks inside a number and its count", () => {
    render(<Example at="/?from=3" />);
    expect(screen.getByRole("status").className).toContain("whitespace-nowrap");
  });

  it("US-QS-15 · issue 1156 a list that pages by free height is marked, so its layer takes its full height", () => {
    render(
      <MemoryRouter>
        <Pager items={["a"]} pageSize={3} fit label="Pflanzen" renderItem={(t) => t} />
        <Pager items={["b"]} pageSize={3} label="Andere" renderItem={(t) => t} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("list", { name: "Pflanzen" }).hasAttribute("data-page-fit")).toBe(true);
    expect(screen.getByRole("list", { name: "Andere" }).hasAttribute("data-page-fit")).toBe(false);
  });

  it("US-QS-15 one page shows no controls", () => {
    render(
      <MemoryRouter>
        <Pager items={["a"]} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-23 a pager with its own address part leaves the first entry of the list behind it alone", async () => {
    render(
      <MemoryRouter initialEntries={["/?from=6"]}>
        <Pager items={items} pageSize={3} label="Verlauf" param="vfrom" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(address()).toBe("?from=6&vfrom=3");
  });
});

describe("Pager in a layer (US-QS-22)", () => {
  it("US-QS-22 a list in a layer keeps its first entry in its own address part, apart from the list of the screen", async () => {
    render(
      <MemoryRouter initialEntries={["/?from=3"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Pager
          items={items}
          pageSize={3}
          label="Im Layer"
          param={LAYER_PARAM}
          renderItem={(t) => t}
        />
        <Where />
      </MemoryRouter>,
    );
    const layerList = screen.getByRole("list", { name: "Im Layer" });
    // The layer starts at its first entry although the screen behind starts at entry 4.
    expect(layerList.textContent).toContain("Pflanze 1");
    await userEvent.click(screen.getAllByRole("button", { name: "Weiter" })[1] as HTMLElement);
    expect(address()).toBe("?from=3&lfrom=3");
    expect(screen.getByRole("list", { name: "Im Layer" }).textContent).toContain("Pflanze 4");
    expect(screen.getByRole("list", { name: "Pflanzen" }).textContent).toContain("Pflanze 4");
  });
});

// jsdom has no layout: the test gives the list region and its rows a height and calls the resize observer the way a
// browser does (US-QS-19). The gap of the list is 0 in jsdom, so the rows are whole heights.
let box = { region: 0, row: 0 };
/** An entry whose row is taller than the others (a chip, a second line), with its height. */
let tall: { name: string; row: number } | null = null;
let observers: Array<() => void> = [];

function resizeTo(region: number, row: number) {
  box = { region, row };
  act(() => {
    for (const notify of observers) notify();
  });
}

/** The layout of a browser for the fit lists: the list region and its rows have the heights of `box`, and a resize is `resizeTo`. */
function stubLayout() {
  box = { region: 0, row: 0 };
  tall = null;
  observers = [];
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = tall && this.textContent === tall.name ? tall.row : box.row;
    const height = this.tagName === "UL" ? box.region : this.tagName === "LI" ? row : 0;
    return { height, width: 0, top: 0, left: 0, right: 0, bottom: height, x: 0, y: 0 } as DOMRect;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(notify: () => void) {
        observers.push(notify);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

function FitExample({ at = "/" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager items={items} pageSize={3} fit label="Pflanzen" renderItem={(t) => t} />
      <Where />
    </MemoryRouter>
  );
}

describe("US-QS-19 page size fills the free height of the region", () => {
  beforeEach(stubLayout);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("US-QS-19 without a layout the pager keeps its starting page size", () => {
    render(<FitExample />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("US-QS-19 the free height of the region gives whole rows per page and the pages count", () => {
    resizeTo(532, 100);
    render(<FitExample />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 2");
  });

  it("US-QS-19 a taller region shows more entries per page, a shorter one fewer", () => {
    resizeTo(316, 100);
    render(<FitExample />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    resizeTo(532, 100);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    resizeTo(208, 100);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("US-QS-19 the pager stays below the list region at the bottom of its frame, also on the last page", () => {
    resizeTo(532, 100);
    render(<FitExample at="/?from=5" />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    const frame = list.parentElement as HTMLElement;
    const bar = screen.getByRole("status");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(list.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(frame.lastElementChild).toBe(bar.parentElement);
    expect(frame.className).toContain("flex-1");
    expect(frame.className).toContain("min-h-0");
    expect(list.className).toContain("flex-1");
    expect(list.className).toContain("min-h-0");
  });

  it("US-QS-19 · FR-BES-23 a resize keeps the first entry on top and writes no address", () => {
    resizeTo(316, 100);
    render(<FitExample at="/?from=3" />);
    expect(screen.getAllByRole("listitem")[0]?.textContent).toBe("Pflanze 4");
    resizeTo(532, 100);
    expect(entries()).toEqual(["Pflanze 4", "Pflanze 5", "Pflanze 6", "Pflanze 7"]);
    expect(address()).toBe("?from=3");
  });

  it("US-QS-19 a region never shrinks below one row: at a large text size the frame scrolls, the pager does not move", () => {
    resizeTo(50, 100);
    render(<FitExample />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.style.minHeight).toBe("100px");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("US-QS-19 · FR-BES-23 a changed page size keeps the entry and never leaves the address past the end", () => {
    resizeTo(316, 100);
    render(<FitExample at="/?from=6" />);
    resizeTo(640, 100);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 2");
    expect(address()).toBe("?from=6");
    expect(screen.getAllByRole("listitem")[0]?.textContent).toBe("Pflanze 7");
  });

  it("US-QS-19 rows of different heights keep one page size on every page instead of changing it back and forth", async () => {
    // Pflanze 1 is taller. Sized from the rows on screen, page 1 would hold 3 and page 2 five, which brings Pflanze 1 back
    // onto page 2 and so on: the page size follows the tallest row seen at this width instead.
    tall = { name: "Pflanze 1", row: 150 };
    resizeTo(532, 100);
    render(<FitExample />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 4",
      "Pflanze 5",
      "Pflanze 6",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
  });
});

// Issue 1492: the address names the first entry on screen, so a reload, a remount or a resize shows the same entries. An
// old page number converts once, at the first measured size; after that the address holds the entry.
const long = Array.from({ length: 108 }, (_, i) => `Pflanze ${i + 1}`);
/** The addresses the router went through since the last reset: a write of the pager shows here as a new entry. */
let trace: string[] = [];

function Trace() {
  const { search } = useLocation();
  useEffect(() => {
    if (trace[trace.length - 1] !== search) trace.push(search);
  }, [search]);
  return null;
}

function FitList({ at }: { at: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager items={long} pageSize={6} fit label="Pflanzen" renderItem={(t) => t} />
      <Where />
      <Trace />
    </MemoryRouter>
  );
}

/** Mounts the list afresh, as a reload does: the old tree goes, the address stays. */
function remount(previous: { unmount: () => void } | null, node: ReactElement, strict: boolean) {
  previous?.unmount();
  trace = [];
  return render(strict ? <StrictMode>{node}</StrictMode> : node);
}

const firstEntry = () => entries()[0];

describe("FR-BES-23 the address names the first entry (issue 1492)", () => {
  beforeEach(() => {
    stubLayout();
    trace = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const strict of [false, true]) {
    const mode = strict ? ", in StrictMode" : "";

    it(`FR-BES-23 an old page address converts once at the measured size, and five fresh mounts keep the entry${mode}`, () => {
      // Starting size 6, measured size 3: page 9 of 3-entry pages is the entry 24, counted from 0.
      resizeTo(300, 100);
      let view = remount(null, <FitList at="/?page=9" />, strict);
      expect(trace).toEqual(["?page=9", "?from=24"]);
      expect(address()).toBe("?from=24");
      expect(firstEntry()).toBe("Pflanze 25");
      for (let i = 0; i < 5; i++) {
        view = remount(view, <FitList at="/?from=24" />, strict);
        expect(trace).toEqual(["?from=24"]);
        expect(address()).toBe("?from=24");
        expect(firstEntry()).toBe("Pflanze 25");
      }
    });

    it(`FR-BES-23 a plain address keeps entry 48 at every measured size of a mount (3, 5, 6)${mode}`, () => {
      let view: { unmount: () => void } | null = null;
      for (const region of [300, 500, 600]) {
        resizeTo(region, 100);
        view = remount(view, <FitList at="/?from=48" />, strict);
        expect(trace).toEqual(["?from=48"]);
        expect(address()).toBe("?from=48");
        expect(firstEntry()).toBe("Pflanze 49");
        expect(entries()).toHaveLength(region / 100);
      }
    });
  }

  it("FR-BES-23 · US-QS-19 a resize while mounted writes no address and keeps the first entry", () => {
    resizeTo(300, 100);
    render(<FitList at="/?from=48" />);
    resizeTo(600, 100);
    expect(entries()).toHaveLength(6);
    expect(firstEntry()).toBe("Pflanze 49");
    resizeTo(500, 100);
    expect(entries()).toHaveLength(5);
    expect(firstEntry()).toBe("Pflanze 49");
    expect(address()).toBe("?from=48");
    expect(trace).toEqual(["?from=48"]);
  });

  it("FR-BES-23 an entry past the end shows the last page, the address follows once, and a second pass writes nothing", () => {
    resizeTo(600, 100);
    const view = render(<FitList at="/?from=999" />);
    expect(address()).toBe("?from=102");
    expect(firstEntry()).toBe("Pflanze 103");
    expect(screen.getByRole("status").textContent).toBe("Seite 18 von 18");
    expect(trace).toEqual(["?from=999", "?from=102"]);
    view.rerender(<FitList at="/?from=999" />);
    resizeTo(600, 100);
    expect(trace).toEqual(["?from=999", "?from=102"]);
  });
});

/** Goes one entry back in the history: the way a layer closes. */
function Earlier() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Eine Ebene zurück
    </button>
  );
}

describe("FR-BES-23 old page addresses convert once (issue 1492)", () => {
  it("FR-BES-23 an old page number of a list in a layer (`?lpage=2`) converts to its own part, the entry of that page", () => {
    render(
      <MemoryRouter initialEntries={["/?lpage=2"]}>
        <Pager
          items={items}
          pageSize={3}
          label="Im Layer"
          param={LAYER_PARAM}
          renderItem={(t) => t}
        />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?lfrom=3");
    expect(entries()).toEqual(["Pflanze 4", "Pflanze 5", "Pflanze 6"]);
  });

  it("FR-BES-23 an old page number of the history of a plant (`?verlauf=2`) converts to `vfrom`", () => {
    render(
      <MemoryRouter initialEntries={["/?verlauf=2"]}>
        <Pager items={items} pageSize={3} label="Verlauf" param="vfrom" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?vfrom=3");
  });

  it("FR-BES-23 with both parts in the address the new one wins and the old one goes", () => {
    render(
      <MemoryRouter initialEntries={["/?lpage=2&lfrom=6"]}>
        <Pager
          items={items}
          pageSize={3}
          label="Im Layer"
          param={LAYER_PARAM}
          renderItem={(t) => t}
        />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?lfrom=6");
    expect(entries()).toEqual(["Pflanze 7"]);
  });

  it("FR-BES-23 with both parts of the screen (`?page=2&from=6`) the new one wins and the old one goes", () => {
    render(
      <MemoryRouter initialEntries={["/?page=2&from=6"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?from=6");
    expect(entries()).toEqual(["Pflanze 7"]);
  });

  it("FR-BES-23 two lists on one screen with old page numbers both convert, and the address keeps both entries", () => {
    render(
      <MemoryRouter initialEntries={["/?page=9&lpage=2"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Pager
          items={items}
          pageSize={3}
          label="Im Layer"
          param={LAYER_PARAM}
          renderItem={(t) => t}
        />
        <Where />
      </MemoryRouter>,
    );
    // Both writes start from the same address: the second one is repeated by the next render, and then both hold.
    const parts = new URLSearchParams(address() ?? "");
    expect(parts.get("from")).toBe("6");
    expect(parts.get("lfrom")).toBe("3");
    expect(parts.has("page")).toBe(false);
    expect(parts.has("lpage")).toBe(false);
  });

  it("FR-BES-23 converting an old page replaces the history entry, so going back leaves the list in one step", async () => {
    render(
      <MemoryRouter initialEntries={["/", "/?page=2"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Where />
        <Earlier />
      </MemoryRouter>,
    );
    expect(address()).toBe("?from=3");
    await userEvent.click(screen.getByRole("button", { name: "Eine Ebene zurück" }));
    expect(address()).toBe("");
  });

  it("FR-BES-23 · US-QS-19 a fit list without a measurement leaves an old address alone", () => {
    render(
      <MemoryRouter initialEntries={["/?page=3"]}>
        <Pager items={items} pageSize={3} fit label="Pflanzen" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    expect(address()).toBe("?page=3");
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
  });

  it("FR-BES-23 · US-QS-15 a changed resetKey goes to the first entry from an old page part too", () => {
    const keyed = (resetKey: string) => (
      <MemoryRouter initialEntries={["/?page=3"]}>
        <Pager
          items={items}
          pageSize={3}
          fit
          label="Pflanzen"
          resetKey={resetKey}
          renderItem={(t) => t}
        />
        <Where />
      </MemoryRouter>
    );
    const view = render(keyed("a"));
    // Without a layout the old page stays until the first measurement (a fit list writes nothing before it).
    expect(address()).toBe("?page=3");
    view.rerender(keyed("b"));
    expect(address()).toBe("");
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });
});

// FR-BES-23: the entries of a server list come in pages; the Pager counts the pages from the server total and asks for
// the next server page when the page on screen reaches beyond the loaded entries (P-10: nothing vanishes silently).
type PagingProps = {
  loaded: string[];
  total?: number;
  at?: string;
  loading?: boolean;
  failure?: string;
  onMore?: () => void;
  onRetry?: () => void;
};

function Paged({
  loaded,
  total = 7,
  at = "/",
  loading = false,
  failure,
  onMore,
  onRetry,
}: PagingProps) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager
        items={loaded}
        pageSize={3}
        label="Pflanzen"
        renderItem={(t) => t}
        paging={{
          total,
          loading,
          ...(failure === undefined ? {} : { failure }),
          onMore: onMore ?? vi.fn(),
          onRetry: onRetry ?? vi.fn(),
          loadingText: "Pflanzen werden geladen …",
          retryText: "Erneut versuchen",
        }}
      />
      <Where />
    </MemoryRouter>
  );
}

describe("FR-BES-23 Pager of a server list", () => {
  it("FR-BES-23 the position counts the pages of the server total, not of the loaded entries", () => {
    render(<Paged loaded={items.slice(0, 3)} total={7} />);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("FR-BES-23 a page beyond the loaded entries asks for the next server page once and shows a loading note, never an empty page", async () => {
    const onMore = vi.fn();
    render(<Paged loaded={items.slice(0, 3)} at="/?from=3" onMore={onMore} />);
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(await screen.findByText("Pflanzen werden geladen …")).toBeTruthy();
  });

  it("FR-BES-23 a page partly loaded shows what is loaded and the note for the rest", async () => {
    render(<Paged loaded={items.slice(0, 4)} at="/?from=3" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pflanze 4"]);
    expect(await screen.findByText("Pflanzen werden geladen …")).toBeTruthy();
  });

  it("FR-BES-23 while a page is on its way it is not asked for again", () => {
    const onMore = vi.fn();
    render(<Paged loaded={items.slice(0, 3)} at="/?from=3" loading onMore={onMore} />);
    expect(onMore).not.toHaveBeenCalled();
  });

  it("P-10 a failed further page keeps the loaded entries, shows the failure with Erneut versuchen, and does not ask again by itself", async () => {
    const onMore = vi.fn();
    const onRetry = vi.fn();
    render(
      <Paged
        loaded={items.slice(0, 3)}
        at="/?from=3"
        failure="Die nächsten Pflanzen sind nicht angekommen."
        onMore={onMore}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Die nächsten Pflanzen sind nicht angekommen.",
    );
    expect(onMore).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 1",
      "Pflanze 2",
      "Pflanze 3",
    ]);
  });
});

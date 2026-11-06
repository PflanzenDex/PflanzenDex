// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pager } from "./pager";

afterEach(cleanup);

const items = Array.from({ length: 7 }, (_, i) => `Pflanze ${i + 1}`);

function Where() {
  const { search } = useLocation();
  return <span data-testid="address">{search}</span>;
}

/** How the address last changed and the state it keeps (the focus rule `keepFocus`, issue 1372). */
function History() {
  const kind = useNavigationType();
  const { state } = useLocation();
  return (
    <>
      <span data-testid="navigation">{kind}</span>
      <span data-testid="state">{JSON.stringify(state)}</span>
    </>
  );
}

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
  it("US-QS-15 shows whole entries of the page named in the address and the position", () => {
    render(<Example at="/?page=2" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 4",
      "Pflanze 5",
      "Pflanze 6",
    ]);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
  });

  it("US-QS-15 a page outside the range shows the nearest valid one and corrects the address", () => {
    render(<Example at="/?page=99" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    expect(screen.getByTestId("address").textContent).toBe("?page=3");
  });

  it("US-QS-15 Weiter and Zurück change the page and are disabled at the ends", async () => {
    render(<Example />);
    const back = screen.getByRole("button", { name: "Zurück" });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 3");
    expect(screen.getByTestId("address").textContent).toBe("?page=2");
    await userEvent.click(back);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
  });

  it("US-QS-15 announces the position politely", () => {
    render(<Example />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("US-QS-15 a changed filter starts at page 1", () => {
    const { rerender } = render(<Example at="/?page=3" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 3 von 3");
    rerender(<Example at="/?page=3" resetKey="b" />);
    expect(screen.getByRole("status").textContent).toBe("Seite 1 von 3");
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
    render(<Example at="/?page=1" />);
    const back = screen.getByRole("button", { name: "Zurück" });
    expect(back.hasAttribute("disabled")).toBe(true);
    expect(back.className).toContain("disabled:text-muted-foreground");
    expect(back.className).toContain("disabled:opacity-100");
  });

  it("US-QS-24 the page caption never breaks inside a number and its count", () => {
    render(<Example at="/?page=2" />);
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

  it("US-QS-23 a pager with its own address part leaves the page of the list behind it alone", async () => {
    render(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <Pager items={items} pageSize={3} label="Verlauf" param="verlauf" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByTestId("address").textContent).toBe("?page=2&verlauf=2");
  });
});

describe("Pager in a layer (US-QS-22)", () => {
  it("US-QS-22 a list in a layer keeps its page in its own address part, apart from the page of the screen", async () => {
    render(
      <MemoryRouter initialEntries={["/?page=2"]}>
        <Pager items={items} pageSize={3} label="Pflanzen" renderItem={(t) => t} />
        <Pager items={items} pageSize={3} label="Im Layer" param="lpage" renderItem={(t) => t} />
        <Where />
      </MemoryRouter>,
    );
    const layerList = screen.getByRole("list", { name: "Im Layer" });
    // The layer starts at its first page although the screen behind stands on page 2.
    expect(layerList.textContent).toContain("Pflanze 1");
    await userEvent.click(screen.getAllByRole("button", { name: "Weiter" })[1] as HTMLElement);
    expect(screen.getByTestId("address").textContent).toBe("?page=2&lpage=2");
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

function FitExample({ at = "/" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <Pager items={items} pageSize={3} fit label="Pflanzen" renderItem={(t) => t} />
      <Where />
    </MemoryRouter>
  );
}

/** Thirty plants on the server (FR-BES-23); `loaded` are the ones on the client, the starting size is six (issue 1372). */
const far = Array.from({ length: 30 }, (_, i) => `Pflanze ${i + 1}`);

function FarExample({
  at,
  loaded = far,
  onMore = () => {},
}: {
  at: string;
  loaded?: string[];
  onMore?: () => void;
}) {
  return (
    <MemoryRouter initialEntries={[{ pathname: "/", search: at, state: { keepFocus: true } }]}>
      <Pager
        items={loaded}
        pageSize={6}
        fit
        label="Pflanzen"
        renderItem={(t) => t}
        paging={{
          total: far.length,
          loading: false,
          onMore,
          onRetry: () => {},
          loadingText: "Pflanzen werden geladen …",
          retryText: "Erneut versuchen",
        }}
      />
      <Where />
      <History />
    </MemoryRouter>
  );
}

describe("US-QS-19 page size fills the free height of the region", () => {
  beforeEach(() => {
    box = { region: 0, row: 0 };
    tall = null;
    observers = [];
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
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
  });

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
    // Page 3 of 3-entry pages starts with entry 7, which is on page 2 of 2 at 5 per page (entries 6 and 7). A link to page 2
    // is different now: its first entry (4) is on page 1 at 5 per page, so a first load shows page 1 (issue 1372).
    resizeTo(532, 100);
    render(<FitExample at="/?page=3" />);
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

  it("US-QS-19 a resize keeps the first entry of the page visible when it can", () => {
    resizeTo(316, 100);
    render(<FitExample at="/?page=2" />);
    expect(screen.getAllByRole("listitem")[0]?.textContent).toBe("Pflanze 4");
    resizeTo(532, 100);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 1",
      "Pflanze 2",
      "Pflanze 3",
      "Pflanze 4",
      "Pflanze 5",
    ]);
    expect(screen.getByTestId("address").textContent).toBe("");
  });

  it("FR-BES-23 a direct link to a far page keeps its first plant on screen when the first measurement shrinks the page, and replaces the address", () => {
    // Page 5 of 6-plant pages starts with plant 25 (index 24); at 3 per page that plant is on page 9 of 10 (issue 1372).
    resizeTo(316, 100);
    render(<FarExample at="?page=5" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 25",
      "Pflanze 26",
      "Pflanze 27",
    ]);
    expect(screen.getByRole("status").textContent).toBe("Seite 9 von 10");
    expect(screen.getByTestId("address").textContent).toBe("?page=9");
    // The link's entry is replaced, not followed by a new one, and the state of the address (keepFocus) is kept.
    expect(screen.getByTestId("navigation").textContent).toBe("REPLACE");
    expect(screen.getByTestId("state").textContent).toBe('{"keepFocus":true}');
  });

  it("FR-BES-23 a direct link to a far page of a server list keeps its plant on screen once that plant is loaded", () => {
    resizeTo(316, 100);
    const onMore = vi.fn();
    const view = render(<FarExample at="?page=5" loaded={far.slice(0, 12)} onMore={onMore} />);
    // Plant 25 is not loaded yet: no row to measure, so the address stays and the next server page is asked for.
    expect(onMore).toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByTestId("address").textContent).toBe("?page=5");
    view.rerender(<FarExample at="?page=5" loaded={far} onMore={onMore} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Pflanze 25",
      "Pflanze 26",
      "Pflanze 27",
    ]);
    expect(screen.getByTestId("address").textContent).toBe("?page=9");
  });

  it("US-QS-19 a region never shrinks below one row: at a large text size the frame scrolls, the pager does not move", () => {
    resizeTo(50, 100);
    render(<FitExample />);
    const list = screen.getByRole("list", { name: "Pflanzen" });
    expect(list.style.minHeight).toBe("100px");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("US-QS-19 a changed page size never leaves the address past the end", () => {
    resizeTo(316, 100);
    render(<FitExample at="/?page=3" />);
    resizeTo(640, 100);
    expect(screen.getByRole("status").textContent).toBe("Seite 2 von 2");
    expect(screen.getByTestId("address").textContent).toBe("?page=2");
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

  it("FR-BES-23 a page beyond the loaded entries asks for the next server page once and shows a loading note, never an empty page", () => {
    const onMore = vi.fn();
    render(<Paged loaded={items.slice(0, 3)} at="/?page=2" onMore={onMore} />);
    expect(onMore).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Pflanzen werden geladen …")).toBeTruthy();
  });

  it("FR-BES-23 a page partly loaded shows what is loaded and the note for the rest", () => {
    render(<Paged loaded={items.slice(0, 4)} at="/?page=2" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pflanze 4"]);
    expect(screen.getByText("Pflanzen werden geladen …")).toBeTruthy();
  });

  it("FR-BES-23 while a page is on its way it is not asked for again", () => {
    const onMore = vi.fn();
    render(<Paged loaded={items.slice(0, 3)} at="/?page=2" loading onMore={onMore} />);
    expect(onMore).not.toHaveBeenCalled();
  });

  it("P-10 a failed further page keeps the loaded entries, shows the failure with Erneut versuchen, and does not ask again by itself", async () => {
    const onMore = vi.fn();
    const onRetry = vi.fn();
    render(
      <Paged
        loaded={items.slice(0, 3)}
        at="/?page=2"
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

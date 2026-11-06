// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pager } from "../pager";
import { dropPageParts, namedEntry, parseFrom, parsePage, position } from "./address";

afterEach(cleanup);

const plants = Array.from({ length: 6 }, (_, i) => `Pflanze ${i + 1}`);

function Paged(props: { loaded: number; failure?: string; plain?: boolean }) {
  return (
    <MemoryRouter initialEntries={["/?from=3"]}>
      <Pager
        items={plants.slice(0, props.loaded)}
        pageSize={3}
        label="Pflanzen"
        renderItem={(name) => (props.plain ? name : <button type="button">{name}</button>)}
        paging={{
          total: 6,
          loading: false,
          failure: props.failure,
          onMore: vi.fn(),
          onRetry: vi.fn(),
          loadingText: "Pflanzen werden geladen …",
          retryText: "Erneut versuchen",
        }}
      />
    </MemoryRouter>
  );
}

describe("FR-BES-23 the focus after a retry of a further page (issue 1304)", () => {
  it("FR-BES-23 a retry that worked moves the focus to the first plant of the page, not to nowhere", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(<Paged loaded={6} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pflanze 4" }));
  });

  it("FR-BES-23 entries without a control: the focus goes to the list", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." plain />);
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    view.rerender(<Paged loaded={6} plain />);
    expect(document.activeElement).toBe(screen.getByRole("list", { name: "Pflanzen" }));
  });

  it("P-10 a retry that failed again leaves the focus on Erneut versuchen", async () => {
    const view = render(<Paged loaded={3} failure="Fehlgeschlagen." />);
    const retry = screen.getByRole("button", { name: "Erneut versuchen" });
    await userEvent.click(retry);
    view.rerender(<Paged loaded={3} failure="Wieder fehlgeschlagen." />);
    expect(document.activeElement).toBe(retry);
  });

  it("FR-BES-23 entries that arrive without a retry leave the focus alone", () => {
    const view = render(<Paged loaded={3} />);
    view.rerender(<Paged loaded={6} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("FR-BES-23 position of a paged list (issue 1492)", () => {
  it("FR-BES-23 the first entry of the address counts from 0, and the pages count from it", () => {
    expect(position({ from: 48, size: 5, count: 108 })).toEqual({ first: 48, page: 11, pages: 22 });
    expect(position({ from: 7, size: 6, count: 108 })).toEqual({ first: 7, page: 3, pages: 19 });
  });

  it("FR-BES-23 the first page starts at entry 0 at any page size", () => {
    expect(position({ from: 0, size: 6, count: 108 })).toEqual({ first: 0, page: 1, pages: 18 });
    expect(position({ from: 0, size: 5, count: 108 })).toEqual({ first: 0, page: 1, pages: 22 });
  });

  it("FR-BES-23 an entry on a page boundary is the start of its page", () => {
    expect(position({ from: 6, size: 3, count: 7 })).toEqual({ first: 6, page: 3, pages: 3 });
  });

  it("FR-BES-23 the last page can be partly filled and counts as a page", () => {
    expect(position({ from: 3, size: 3, count: 7 })).toEqual({ first: 3, page: 2, pages: 3 });
  });

  it("FR-BES-23 an entry past the end shows the first entry of the last page", () => {
    expect(position({ from: 999, size: 5, count: 108 })).toEqual({
      first: 105,
      page: 22,
      pages: 22,
    });
    expect(position({ from: 9, size: 3, count: 9 })).toEqual({ first: 6, page: 3, pages: 3 });
  });

  it("FR-BES-23 a list without entries has one page at entry 0", () => {
    expect(position({ from: 0, size: 3, count: 0 })).toEqual({ first: 0, page: 1, pages: 1 });
    expect(position({ from: 5, size: 3, count: 0 })).toEqual({ first: 0, page: 1, pages: 1 });
  });

  it("FR-BES-23 for sizes 1 to 12, counts 0 to 40 and entries 0 to 45, the first entry is in range and Weiter and Zurück step one page", () => {
    for (let size = 1; size <= 12; size++) {
      for (let count = 0; count <= 40; count++) {
        for (let from = 0; from <= 45; from++) {
          const start = position({ from, size, count });
          const inRange = count === 0 ? start.first === 0 : start.first >= 0 && start.first < count;
          expect(inRange, `size ${size} count ${count} from ${from}`).toBe(true);

          // Weiter is enabled exactly while the page is not the last one: the entries after it still exist.
          let at = start.first;
          let page = start.page;
          while (page < start.pages) {
            const target = at + size;
            expect(target < count, `Weiter size ${size} count ${count} from ${from}`).toBe(true);
            const next = position({ from: target, size, count });
            expect(next.first).toBe(target);
            expect(next.page).toBe(page + 1);
            expect(next.pages).toBe(start.pages);
            at = next.first;
            page = next.page;
          }
          expect(page).toBe(start.pages);

          // Zurück from the start goes back one page each time and ends at the first entry on page 1.
          at = start.first;
          page = start.page;
          while (page > 1) {
            const next = position({ from: Math.max(0, at - size), size, count });
            expect(next.page).toBe(page - 1);
            at = next.first;
            page = next.page;
          }
          expect(at).toBe(0);
        }
      }
    }
  });
});

describe("FR-BES-23 the address parts of a paged list (issue 1492)", () => {
  it("FR-BES-23 a first entry is a non-negative whole number, anything else is the first entry", () => {
    expect(parseFrom("48")).toBe(48);
    expect(parseFrom("0")).toBe(0);
    expect(parseFrom(null)).toBe(0);
    expect(parseFrom("-3")).toBe(0);
    expect(parseFrom("2.5")).toBe(0);
    expect(parseFrom("abc")).toBe(0);
  });

  it("FR-BES-23 an old page number starts at 1, anything else is the first page", () => {
    expect(parsePage("2")).toBe(2);
    expect(parsePage("0")).toBe(1);
    expect(parsePage(null)).toBe(1);
  });

  it("FR-BES-23 the entry the address names: its own part wins, else an old page at the page size, else the first entry", () => {
    expect(namedEntry(new URLSearchParams("from=6&page=2"), "from", 3)).toBe(6);
    expect(namedEntry(new URLSearchParams("page=2"), "from", 3)).toBe(3);
    expect(namedEntry(new URLSearchParams("page=2"), "from", 6)).toBe(6);
    expect(namedEntry(new URLSearchParams("lpage=3"), "lfrom", 4)).toBe(8);
    expect(namedEntry(new URLSearchParams(""), "from", 3)).toBe(0);
  });

  it("FR-BES-23 dropping a list's part takes its new and its old name, and no other part", () => {
    const params = new URLSearchParams("page=2&from=3&rpage=4&rfrom=5&keep=1");
    dropPageParts(params, "from", "rfrom");
    expect(params.toString()).toBe("keep=1");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadMore, type LoadMoreProps } from "./load-more";

afterEach(cleanup);

const base: LoadMoreProps = {
  loadedCount: 20,
  totalCount: 45,
  hasMore: true,
  pending: false,
  onLoadMore: () => undefined,
};

describe("LoadMore (US-QS-07, DS-34)", () => {
  it("US-QS-07 shows the button and the visible count n von m", () => {
    render(<LoadMore {...base} />);
    expect(screen.getByRole("button", { name: "Mehr laden" })).toBeTruthy();
    expect(screen.getByText("20 von 45 angezeigt")).toBeTruthy();
  });

  it("US-QS-07 an unknown total reads 'angezeigt' only, never an invented total (P-08)", () => {
    render(<LoadMore {...base} totalCount={undefined} />);
    expect(screen.getByText("20 angezeigt")).toBeTruthy();
  });

  it("US-QS-07 pending: disabled, busy, PlantLoader drawn, and the button text says Lädt", () => {
    const { container } = render(<LoadMore {...base} pending />);
    const button = screen.getByRole("button", { name: "Lädt…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("US-QS-07 reserves the loader slot when idle, so the button does not change size", () => {
    const { container } = render(<LoadMore {...base} />);
    expect(container.querySelector("button span.size-6")).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("min-h-[88px]");
  });

  it("US-QS-07 the keyboard triggers it with Enter and Space; a click calls once", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(<LoadMore {...base} onLoadMore={onLoadMore} />);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("US-QS-07 does not announce on first render", () => {
    render(<LoadMore {...base} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("US-QS-07 announces the added count and n von m politely once the load finished, focus stays", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(<LoadMore {...base} onLoadMore={onLoadMore} />);
    const button = screen.getByRole("button", { name: "Mehr laden" });
    await user.click(button);
    expect(document.activeElement).toBe(button);
    rerender(<LoadMore {...base} pending onLoadMore={onLoadMore} />);
    expect(screen.getByRole("status").textContent).toBe("");
    rerender(<LoadMore {...base} loadedCount={40} onLoadMore={onLoadMore} />);
    expect(screen.getByRole("status").textContent).toBe("20 weitere geladen. 40 von 45 angezeigt.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mehr laden" }));
  });

  it("US-QS-07 focus moves to the 'Alles geladen' note when the last page arrived", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LoadMore {...base} loadedCount={40} />);
    await user.click(screen.getByRole("button", { name: "Mehr laden" }));
    rerender(<LoadMore {...base} loadedCount={40} pending />);
    rerender(<LoadMore {...base} loadedCount={45} hasMore={false} />);
    expect(document.activeElement).toBe(screen.getByText("Alles geladen"));
    expect(screen.getByRole("status").textContent).toBe("5 weitere geladen. 45 von 45 angezeigt.");
  });

  it("US-QS-07 focus is not stolen when it was elsewhere during the load", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <LoadMore {...base} />
        <input aria-label="Suche" />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Mehr laden" }));
    rerender(
      <>
        <LoadMore {...base} pending />
        <input aria-label="Suche" />
      </>,
    );
    await user.click(screen.getByLabelText("Suche"));
    rerender(
      <>
        <LoadMore {...base} loadedCount={40} />
        <input aria-label="Suche" />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Suche"));
  });

  it("US-QS-07 the spinner stops under reduced motion", () => {
    const { container } = render(<LoadMore {...base} pending />);
    for (const g of container.querySelectorAll("g"))
      expect(g.getAttribute("class")).toContain("motion-reduce:animate-none");
  });

  it("US-QS-07 works with react-query useInfiniteQuery pages", async () => {
    const user = userEvent.setup();
    const fetchPage = async ({ pageParam }: { pageParam: number }) => ({
      items: Array.from({ length: 2 }, (_, i) => pageParam * 2 + i),
      next: pageParam < 1 ? pageParam + 1 : undefined,
    });
    function List() {
      const q = useInfiniteQuery({
        queryKey: ["arten"],
        queryFn: fetchPage,
        initialPageParam: 0,
        getNextPageParam: (last) => last.next,
      });
      const loaded = q.data?.pages.flatMap((p) => p.items).length ?? 0;
      return (
        <LoadMore
          loadedCount={loaded}
          totalCount={4}
          hasMore={q.hasNextPage}
          pending={q.isFetchingNextPage}
          onLoadMore={() => void q.fetchNextPage()}
        />
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <List />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Mehr laden" }));
    expect(await screen.findByText("Alles geladen")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("2 weitere geladen. 4 von 4 angezeigt."),
    );
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazy-page";
import { preloadPages, preloadWhenIdle, usePreloadOnIntent } from "./preload";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("US-QS-07 · DS-08 preloading of the pages", () => {
  it("US-QS-07 the destination chunks are requested once the shell is idle, and once only (issue 1645)", async () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => ({ default: () => null }));
    const second = vi.fn(async () => ({ default: () => null }));
    const [firstPage, secondPage] = [lazyPage(first), lazyPage(second)] as const;
    const pages = [firstPage, secondPage];
    preloadWhenIdle([[firstPage], [secondPage]]);
    // The shell is still busy: no chunk is requested yet.
    expect(first).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    // A later request for the same pages (a pressed link) shares the chunks already on their way.
    preloadPages(pages);
    await vi.advanceTimersByTimeAsync(2000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 a cancelled preload requests nothing that is still waiting (issue 1645)", async () => {
    vi.useFakeTimers();
    const loader = vi.fn(async () => ({ default: () => null }));
    const cancel = preloadWhenIdle([[lazyPage(loader)]]);
    cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(loader).not.toHaveBeenCalled();
  });

  it("US-QS-07 pressing a link requests the chunk of its page at once, before the shell is idle (issue 1645)", () => {
    const loader = vi.fn(async () => ({ default: () => null }));
    const page = lazyPage(loader);
    const Harness = () => {
      usePreloadOnIntent((href) => (href === "/sammlung" ? [page] : undefined));
      return null;
    };
    render(createElement(Harness));
    const link = document.createElement("a");
    link.setAttribute("href", "/sammlung");
    document.body.append(link);
    // The press alone asks for the chunk: nothing waits for the idle moment, and the tap that follows finds it on its way.
    fireEvent.pointerDown(link);
    expect(loader).toHaveBeenCalledTimes(1);
    link.remove();
  });
});

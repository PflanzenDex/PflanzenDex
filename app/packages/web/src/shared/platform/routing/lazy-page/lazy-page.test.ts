// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lazyPage, type AnyComponent, type LazyPage } from "./lazy-page";
import {
  LOADING_STATUS_DELAY_MS,
  LOADING_STATUS_HOLD_MS,
  useLoadingWindow,
} from "./loading-window";

const Window = () => null;
type WindowModule = { default: typeof Window };

describe("US-QS-07 · DS-08 · P-10 lazyPage requests its chunk again after a failure and shares a pending request", () => {
  it("US-QS-07 · DS-08 · P-10 after a failed load() the next load() requests the chunk again and resolves to the component", async () => {
    const loader = vi
      .fn<() => Promise<WindowModule>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ default: Window });
    const page = lazyPage(loader);
    await expect(page.load()).rejects.toThrow("offline");
    expect(page.loaded()).toBeNull();
    await expect(page.load()).resolves.toBe(Window);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(page.loaded()).toBe(Window);
  });

  it("US-QS-07 · DS-08 · P-10 two load() calls while the chunk is pending share one request", async () => {
    let finish: (module: WindowModule) => void = () => undefined;
    const loader = vi.fn<() => Promise<WindowModule>>(
      () =>
        new Promise<WindowModule>((resolve) => {
          finish = resolve;
        }),
    );
    const page = lazyPage(loader);
    const first = page.load();
    const second = page.load();
    expect(second).toBe(first);
    expect(loader).toHaveBeenCalledTimes(1);
    finish({ default: Window });
    await expect(first).resolves.toBe(Window);
    expect(page.loaded()).toBe(Window);
  });
});

/** A window whose chunk waits until the test finishes it: `finish` resolves the load with the component. */
function windowChunk() {
  const component: AnyComponent = () => null;
  let finish: () => void = () => undefined;
  const load = vi.fn(
    () =>
      new Promise<AnyComponent>((resolve) => {
        finish = () => resolve(component);
      }),
  );
  const page = Object.assign(component, {
    load,
    loaded: () => null,
  }) as unknown as LazyPage<AnyComponent>;
  return { page, component, finish: () => finish() };
}

const noop = () => undefined;

describe("US-QS-14 issue 1784 · the window status of a chunk that loads is held 300 ms once shown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("US-QS-14 issue 1784 · the hold is 300 ms (assumption, owner decision D5)", () => {
    expect(LOADING_STATUS_HOLD_MS).toBe(300);
  });

  it("US-QS-14 issue 1784 · a load that ends at 250 ms shows no status and the content at once", async () => {
    const { page, component, finish } = windowChunk();
    const { result } = renderHook(() => useLoadingWindow(page, true, noop));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.waiting).toBe(false);
    await act(async () => {
      finish();
    });
    expect(result.current.waiting).toBe(false);
    expect(result.current.Component).toBe(component);
    act(() => {
      vi.advanceTimersByTime(LOADING_STATUS_HOLD_MS * 2);
    });
    expect(result.current.waiting).toBe(false);
    expect(result.current.Component).toBe(component);
  });

  it("US-QS-14 issue 1784 · a status shown at 300 ms and a load that ends at 350 ms stays until 600 ms, then the content shows", async () => {
    const { page, component, finish } = windowChunk();
    const { result } = renderHook(() => useLoadingWindow(page, true, noop));
    act(() => {
      vi.advanceTimersByTime(LOADING_STATUS_DELAY_MS - 1);
    });
    expect(result.current.waiting).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.waiting).toBe(true);
    expect(result.current.Component).toBeNull();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      finish();
    });
    expect(result.current.waiting).toBe(true);
    expect(result.current.Component).toBeNull();
    act(() => {
      vi.advanceTimersByTime(LOADING_STATUS_HOLD_MS - 51);
    });
    expect(result.current.waiting).toBe(true);
    expect(result.current.Component).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.waiting).toBe(false);
    expect(result.current.Component).toBe(component);
  });

  it("US-QS-14 issue 1784 · a load that outlasts the hold keeps its status until it ends, then the content shows at once", async () => {
    const { page, component, finish } = windowChunk();
    const { result } = renderHook(() => useLoadingWindow(page, true, noop));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.waiting).toBe(true);
    expect(result.current.Component).toBeNull();
    await act(async () => {
      finish();
    });
    expect(result.current.waiting).toBe(false);
    expect(result.current.Component).toBe(component);
  });

  it("US-QS-14 issue 1784 · closing the window during the hold ends the status, and a reopen with the chunk in hand shows none", async () => {
    const { page, component, finish } = windowChunk();
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useLoadingWindow(page, open, noop),
      { initialProps: { open: true } },
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_STATUS_DELAY_MS);
    });
    await act(async () => {
      finish();
    });
    expect(result.current.waiting).toBe(true);
    rerender({ open: false });
    expect(result.current.waiting).toBe(false);
    act(() => {
      vi.advanceTimersByTime(LOADING_STATUS_HOLD_MS);
    });
    rerender({ open: true });
    expect(result.current.waiting).toBe(false);
    expect(result.current.Component).toBe(component);
  });
});

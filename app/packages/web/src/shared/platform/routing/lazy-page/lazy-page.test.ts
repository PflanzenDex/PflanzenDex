import { describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazy-page";

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

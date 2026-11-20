import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBadge, type BadgeNavigator } from "./badge-api";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

function browser(): Required<BadgeNavigator> {
  return {
    setAppBadge: vi.fn(() => Promise.resolve()),
    clearAppBadge: vi.fn(() => Promise.resolve()),
  };
}

describe("US-QS-29 the browser's badge", () => {
  it("US-QS-29 sets the number with setAppBadge", () => {
    const nav = browser();
    applyBadge(4, nav);
    expect(nav.setAppBadge).toHaveBeenCalledWith(4);
    expect(nav.clearAppBadge).not.toHaveBeenCalled();
  });

  it("US-QS-29 clears the badge with clearAppBadge", () => {
    const nav = browser();
    applyBadge("clear", nav);
    expect(nav.clearAppBadge).toHaveBeenCalledOnce();
    expect(nav.setAppBadge).not.toHaveBeenCalled();
  });

  it("US-QS-29 does nothing and shows no error where the browser has no badge API", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => applyBadge(4, {})).not.toThrow();
    expect(() => applyBadge("clear", {})).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("US-QS-29 writes a refused badge call to the console and throws nothing (P-10)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nav = browser();
    nav.setAppBadge = vi.fn(() => Promise.reject(new Error("refused")));
    expect(() => applyBadge(4, nav)).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("US-QS-29 writes a badge call that throws at once to the console (P-10)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const nav = browser();
    nav.clearAppBadge = vi.fn(() => {
      throw new Error("not allowed");
    });
    expect(() => applyBadge("clear", nav)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});

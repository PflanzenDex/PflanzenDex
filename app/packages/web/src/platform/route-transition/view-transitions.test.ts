// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransitions } from "./view-transitions";

const doc = document as unknown as { startViewTransition?: unknown };

function setup(opts: { supported: boolean; reduced: boolean }) {
  window.matchMedia = ((q: string) => ({
    matches: opts.reduced && q.includes("reduce"),
  })) as typeof window.matchMedia;
  const started = vi.fn((update: () => Promise<void>) => {
    void update();
    return { finished: Promise.resolve() };
  });
  if (opts.supported) doc.startViewTransition = started;
  else delete doc.startViewTransition;
  return started;
}
const a = { pathname: "/a", state: null };
const b = { pathname: "/b", state: null };

afterEach(() => {
  delete doc.startViewTransition;
  delete document.documentElement.dataset.routeTransition;
});

describe("US-QS-14 · route transition (progressive enhancement, ADR 0011 decision 5)", () => {
  it("US-QS-14 a view change runs inside a view transition and the new view is rendered by it", () => {
    const started = setup({ supported: true, reduced: false });
    const apply = vi.fn();
    expect(createTransitions().run(a, b, apply)).toBe(true);
    expect(started).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.routeTransition).toBe("");
  });

  it("US-QS-14 with reduced motion no transition starts and the caller renders the change itself", () => {
    const started = setup({ supported: true, reduced: true });
    const apply = vi.fn();
    expect(createTransitions().run(a, b, apply)).toBe(false);
    expect(started).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
  });

  it("US-QS-14 without browser support nothing changes", () => {
    setup({ supported: false, reduced: false });
    expect(createTransitions().run(a, b, vi.fn())).toBe(false);
  });

  it("US-QS-14 a switch inside a view or a change of the query alone does not cross-fade", () => {
    const started = setup({ supported: true, reduced: false });
    const t = createTransitions();
    expect(t.run(a, { ...a }, vi.fn())).toBe(false);
    expect(t.run(a, { pathname: "/b", state: { keepFocus: true } }, vi.fn())).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });

  it("US-QS-14 the marker goes when the transition has finished", async () => {
    setup({ supported: true, reduced: false });
    createTransitions().run(a, b, vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.dataset.routeTransition).toBeUndefined();
  });
});

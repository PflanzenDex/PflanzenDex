// Vitest setup: every `render` of a page gets the data layer (one fresh query client per render, no retries), so
// pages are tested the way main.tsx runs them without each test repeating the provider.
import { QueryClientProvider } from "@tanstack/react-query";
import { configure } from "@testing-library/dom";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { setViewportWidth } from "../viewport-mock";

vi.mock("@testing-library/react", async (importOriginal) => {
  const rtl = await importOriginal<typeof import("@testing-library/react")>();
  // One client per `render` call: it must survive re-renders, or the cache would vanish with each state change.
  const wrap = (Outer?: (p: { children: ReactNode }) => ReactNode) => {
    const client = createQueryClient();
    return ({ children }: { children: ReactNode }) => {
      const inner = Outer ? <Outer>{children}</Outer> : children;
      return <QueryClientProvider client={client}>{inner}</QueryClientProvider>;
    };
  };
  return {
    ...rtl,
    render: (ui: ReactNode, options?: Parameters<typeof rtl.render>[1]) =>
      rtl.render(ui, { ...options, wrapper: wrap(options?.wrapper as never) } as never),
    renderHook: (hook: never, options?: Parameters<typeof rtl.renderHook>[1]) =>
      rtl.renderHook(hook, { ...options, wrapper: wrap(options?.wrapper as never) } as never),
  };
});

// `findBy*` and `waitFor` give up after 1 s by default. Under machine load (two `make ci` at once) a render that takes
// 0.2 s alone needs more than that, which failed correct tests (#200). A longer wait costs nothing when the element
// appears at once and still fails when it never does; it stays below the 5 s test timeout.
configure({ asyncUtilTimeout: 4000 });

// jsdom has no `matchMedia`; the layers and the paged tiles read the breakpoints, so a phone-sized viewport is the
// default. A test that needs another width calls `setViewportWidth` itself.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") setViewportWidth(360);

// jsdom has no pointer capture; the bottom sheet (Vaul) calls it on a pointer press, which the phone-sized default
// viewport opens, so a click in a sheet threw an unhandled error.
if (typeof Element !== "undefined" && typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
}

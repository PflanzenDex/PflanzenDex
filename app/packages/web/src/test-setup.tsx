// Vitest setup: every `render` of a page gets the data layer (one fresh query client per render, no retries), so
// pages are tested the way main.tsx runs them without each test repeating the provider.
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createQueryClient } from "./kernel";

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

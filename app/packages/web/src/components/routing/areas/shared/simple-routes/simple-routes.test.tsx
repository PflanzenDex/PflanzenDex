// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/routing/areas/today-area/today-area", () => ({
  TodayArea: () => <p>START</p>,
}));

import { AppRoutes } from "@/routes";

const renderAt = (path: string, features?: { social: boolean }) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes
        api="http://api.test"
        session={{ token: async () => "tok" } as never}
        account={{ id: "1", ...(features ? { features } : {}) } as never}
        onOpen={() => undefined}
        onOpenProfile={() => undefined}
        handOver={{} as never}
      />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-DEV-06 routes of the function group social", () => {
  it("US-DEV-06 Freunde, a friend's collection and the exchange lead to Heute while social is off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    for (const path of ["/friends", "/friends/exchange", "/friends/match", "/friends/abc"]) {
      renderAt(path, { social: false });
      expect(await screen.findByText("START"), path).toBeTruthy();
      cleanup();
    }
  });

  it("US-DEV-06 without a state or with social on, /friends opens the friends page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ friends: [], requests: [] }), { status: 200 }),
      ),
    );
    renderAt("/friends");
    expect(await screen.findByRole("heading", { name: /Freunde/ })).toBeTruthy();
    expect(screen.queryByText("START")).toBeNull();
  });
});

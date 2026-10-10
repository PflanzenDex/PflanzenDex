// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { Subscriptions } from "./subscriptions";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

function fakeServer(endpoints: string[]) {
  const removed: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "DELETE") {
        const { endpoint } = JSON.parse(String(init.body)) as { endpoint: string };
        removed.push(endpoint);
        endpoints.splice(endpoints.indexOf(endpoint), 1);
        return response(200, { removed: true });
      }
      return response(200, { subscriptions: endpoints.map((endpoint) => ({ endpoint })) });
    }),
  );
  return removed;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Subscriptions api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-MON-08 push subscription management", () => {
  it("US-MON-08 says that no browser is registered and that push sending is not set up yet", async () => {
    fakeServer([]);
    show();
    expect(await screen.findByText("Kein Browser ist für Push angemeldet.")).toBeTruthy();
    expect(screen.getByText(/noch nicht eingerichtet/)).toBeTruthy();
  });

  it("US-MON-08 lists the browsers and removes one", async () => {
    const removed = fakeServer(["https://push.example/abc", "https://other.example/def"]);
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Browser über push.example abmelden" }),
    );
    expect((await screen.findByRole("status")).textContent).toBe("Browser abgemeldet.");
    expect(removed).toEqual(["https://push.example/abc"]);
    expect(screen.queryByText("Browser über push.example")).toBeNull();
    expect(screen.getByText("Browser über other.example")).toBeTruthy();
  });
});

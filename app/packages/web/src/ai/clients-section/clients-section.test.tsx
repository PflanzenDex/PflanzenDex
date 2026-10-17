// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { AiClientsSection } from "./clients-section";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  clientId: "https://claude.ai/client",
  clientName: "Claude",
  rights: "drafts",
  requestedRights: null,
  createdAt: "2026-10-10T08:00:00.000Z",
  lastUse: "2026-10-10T09:00:00.000Z",
  revokedAt: null,
  ...over,
});

function fakeServer(rows: Record<string, unknown>[]) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(url)).pathname;
      if (method !== "GET") {
        calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return response(200, {});
      }
      return response(200, { connections: rows });
    }),
  );
  return calls;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AiClientsSection api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-KI-07 connected AI clients", () => {
  it("US-KI-07 says where the data goes, shows the address and that nothing is connected yet", async () => {
    fakeServer([]);
    show();
    expect(await screen.findByText("Noch ist kein KI-Client verbunden.")).toBeTruthy();
    expect(screen.getByText(/Der Anbieter deines KI-Clients erhält die Daten/)).toBeTruthy();
    expect(screen.getByText("http://api/mcp")).toBeTruthy();
  });

  it("US-KI-07 lists name, rights, since and last use", async () => {
    fakeServer([row()]);
    show();
    const list = await screen.findByRole("list", { name: "Verbundene KI-Clients" });
    expect(list.textContent).toContain("Claude");
    expect(list.textContent).toContain("Lesen und Entwürfe anlegen");
    expect(list.textContent).toContain("Verbunden seit");
    expect(list.textContent).toContain("Zuletzt genutzt:");
  });

  it("US-KI-07 changes the right and revokes", async () => {
    const calls = fakeServer([row()]);
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByLabelText("Recht für Claude"), "read");
    expect((await screen.findByRole("status")).textContent).toBe("Das Recht ist geändert.");
    await user.click(screen.getByRole("button", { name: "Claude trennen" }));
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /ai/connections/c1/rights",
      "POST /ai/connections/c1/revoke",
    ]);
    expect(calls[0]?.body).toEqual({ rights: "read" });
  });

  it("US-KI-07 shows a request for a higher right and confirms it only when the keeper presses Erlauben", async () => {
    const calls = fakeServer([row({ requestedRights: "write" })]);
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/fragt nach dem Recht „Schreiben“/)).toBeTruthy();
    expect(calls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Recht „Schreiben“ für Claude erlauben" }));
    expect(calls[0]).toMatchObject({ method: "PUT", body: { rights: "write" } });
  });

  it("US-KI-07 keeps a revoked client visible and offers to allow it again", async () => {
    const calls = fakeServer([row({ revokedAt: "2026-10-10T10:00:00.000Z" })]);
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/Getrennt am/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Claude wieder zulassen" }));
    expect(calls[0]).toMatchObject({ method: "POST", path: "/ai/connections/c1/allow-again" });
  });
});

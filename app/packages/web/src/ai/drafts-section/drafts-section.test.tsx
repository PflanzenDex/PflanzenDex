// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { DraftsSection } from "./drafts-section";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const row = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  clientName: "Claude",
  type: "wish",
  content: { name: "Aloe vera" },
  source: "https://example.test/q",
  status: "open",
  createdAt: "2026-10-10T08:00:00.000Z",
  ...over,
});

function fakeServer(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(url)).pathname;
      if (method === "GET") return response(200, { drafts: rows });
      calls.push(`${method} ${path}`);
      return response(200, {});
    }),
  );
  return calls;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <DraftsSection api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-KI-09 inbox of AI drafts", () => {
  it("US-KI-09 says when there are no drafts", async () => {
    fakeServer([]);
    show();
    expect(await screen.findByText("Keine Entwürfe vorhanden.")).toBeTruthy();
  });

  it("US-KI-09 shows type, name, connection, source and the label 'not reviewed' (KI-R5)", async () => {
    fakeServer([row()]);
    show();
    const list = await screen.findByRole("list", { name: "KI-Entwürfe" });
    expect(list.textContent).toContain("Wunsch: Aloe vera");
    expect(list.textContent).toContain("KI-Entwurf von Claude, noch nicht geprüft");
    expect(list.textContent).toContain("https://example.test/q");
  });

  it("US-KI-09 adopts and discards only open drafts, by the keeper's action", async () => {
    const calls = fakeServer([
      row(),
      row({ id: "d2", status: "adopted", content: { name: "Alt" } }),
    ]);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Wunsch: Aloe vera übernehmen" }));
    await user.click(screen.getByRole("button", { name: "Wunsch: Aloe vera verwerfen" }));
    expect(calls).toEqual(["POST /ai/drafts/d1/adopt", "POST /ai/drafts/d1/discard"]);
    expect(screen.queryByRole("button", { name: "Wunsch: Alt übernehmen" })).toBeNull();
  });
});

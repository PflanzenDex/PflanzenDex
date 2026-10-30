// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { LogSection } from "./log-section";

const show = (log: unknown[]) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ log }), { status: 200 })),
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <LogSection api="http://api" token={async () => "tok"} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-KI-10 log of AI actions", () => {
  it("US-KI-10 says when nothing happened", async () => {
    show([]);
    expect(await screen.findByText("Dein KI-Client hat noch nichts getan.")).toBeTruthy();
  });

  it("US-KI-10 lists operation, effect, client and time", async () => {
    show([
      {
        id: "l1",
        clientName: "Claude",
        operation: "propose_draft",
        effect: "draft: wish",
        createdAt: "2026-10-10T08:00:00.000Z",
      },
    ]);
    const list = await screen.findByRole("list", { name: "KI-Protokoll" });
    expect(list.textContent).toContain("propose_draft");
    expect(list.textContent).toContain("draft: wish");
    expect(list.textContent).toContain("Claude");
  });
});

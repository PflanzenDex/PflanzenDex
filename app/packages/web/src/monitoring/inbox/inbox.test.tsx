// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { Inbox } from "./inbox";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const show = (reminders: unknown[]) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(200, { reminders })),
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Inbox api="http://api" token={token} />
    </QueryClientProvider>,
  );
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (id: string, localDate: string, status: string) => ({
  id,
  localDate,
  status,
  attempts: 1,
  lastError: null,
  items: [
    { id: `t:${id}`, occasion: "treatment", text: "Gießen fällig", nextAction: "Jetzt gießen" },
  ],
});

describe("US-MON-01 reminder inbox", () => {
  it("US-MON-01 shows the days newest first with text, next action and the status in words", async () => {
    show([row("2", "2026-10-10", "in_app"), row("1", "2026-10-09", "delivered")]);
    const days = await screen.findAllByRole("heading", { level: 4 });
    expect(days.map((d) => d.textContent)).toEqual([
      "Samstag, 10. Oktober 2026",
      "Freitag, 9. Oktober 2026",
    ]);
    expect(screen.getByText("Nur im Posteingang")).toBeTruthy();
    expect(screen.getByText("Zugestellt")).toBeTruthy();
    expect(screen.getAllByText("Jetzt gießen")).toHaveLength(2);
  });

  it("US-MON-01 keeps a failed delivery visible and points to the Today list (P-10)", async () => {
    show([row("1", "2026-10-09", "failed")]);
    expect(await screen.findByText("Zustellung fehlgeschlagen")).toBeTruthy();
    expect(screen.getByText(/Heute-Liste/)).toBeTruthy();
  });

  it("US-MON-01 says there is nothing to remind of and where it will appear", async () => {
    show([]);
    expect(await screen.findByText("Keine Erinnerungen")).toBeTruthy();
  });
});

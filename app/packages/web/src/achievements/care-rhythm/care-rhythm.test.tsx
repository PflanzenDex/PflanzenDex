// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { CareRhythmSection } from "./care-rhythm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const token = async () => "tok";
const weeks = (states: string[]) =>
  states.map((state, i) => ({ start: `2026-0${(i % 9) + 1}-01`, state }));
const answer = (over: object = {}) => ({
  calmMode: false,
  weeks: weeks(["none", "on_time", "on_time", "open", "pending"]),
  currentRun: 2,
  longestRun: 5,
  openTasks: 0,
  hasTasks: true,
  ...over,
});

function show(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      expect(new URL(String(url)).pathname).toBe("/achievements/rhythm");
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <CareRhythmSection api="http://api" token={token} />
    </QueryClientProvider>,
  );
}

describe("US-ACH-04 care rhythm", () => {
  it("US-ACH-04 shows the current run, the longest run and the weeks as text, not by colour alone", async () => {
    show(200, answer());
    expect(await screen.findByText(/Aktueller Rhythmus: 2 Wochen pünktlich/)).toBeTruthy();
    expect(screen.getByText(/Längster Rhythmus bisher: 5 Wochen/)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Woche vom 01.04.2026: offen")).toBeTruthy();
    expect(screen.getByText("Woche vom 01.02.2026: pünktlich")).toBeTruthy();
  });

  it("US-ACH-04 a missed week names the open tasks and the next step, never a loss (P-09)", async () => {
    show(200, answer({ currentRun: 0, openTasks: 2 }));
    expect(
      await screen.findByText(/2 Termine sind offen\. Erledige sie unter „Heute“\./),
    ).toBeTruthy();
    expect(document.body.textContent).toMatch(/Längster Rhythmus bisher: 5 Wochen/);
    expect(document.body.textContent).not.toMatch(/verloren|unterbrochen|gerissen/i);
  });

  it("US-ACH-04 without any due task the rhythm is unknown and says what fills it (P-08)", async () => {
    show(200, answer({ hasTasks: false, currentRun: 0, longestRun: 0, weeks: weeks(["none"]) }));
    expect(await screen.findByText(/Noch war kein Pflegetermin fällig/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Aktueller Rhythmus/);
  });

  it("US-ACH-08 calm mode and a read error show nothing", async () => {
    for (const [status, body] of [
      [200, { calmMode: true }],
      [500, { error: { code: "internal" } }],
    ] as const) {
      const view = show(status, body);
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(view.container.textContent).toBe("");
      cleanup();
    }
  });
});

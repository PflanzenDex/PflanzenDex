// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  pauses: [],
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

describe("US-ACH-04 explicit pause", () => {
  function showWithWrites(
    body: unknown,
    write: (url: string, method: string, body: string) => Response,
  ) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const u = new URL(String(url));
        if (init?.method && init.method !== "GET") {
          calls.push(`${init.method} ${u.pathname}`);
          return write(u.pathname, init.method, String(init.body ?? ""));
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <CareRhythmSection api="http://api" token={token} />
      </QueryClientProvider>,
    );
    return calls;
  }

  it("US-ACH-04 lists the pauses and removes one; the rhythm is loaded again", async () => {
    const pause = { id: "p1", from: "2026-07-01", until: "2026-07-14" };
    const calls = showWithWrites(
      answer({ pauses: [pause] }),
      () => new Response("{}", { status: 200 }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Pause vom 01.07.2026 entfernen/ }));
    expect(await screen.findByText("Pause entfernt.")).toBeTruthy();
    expect(calls).toEqual(["DELETE /achievements/rhythm/pauses/p1"]);
  });

  it("US-ACH-04 sends the dates of a new pause", async () => {
    const calls = showWithWrites(answer(), (_p, _m, body) => {
      expect(JSON.parse(body)).toEqual({ from: "2026-07-01", until: "2026-07-14" });
      return new Response(JSON.stringify({ id: "p2", from: "2026-07-01", until: "2026-07-14" }), {
        status: 201,
      });
    });
    await screen.findByText(/Aktueller Rhythmus/);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Bis (einschließlich)"), {
      target: { value: "2026-07-14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause eintragen" }));
    expect(await screen.findByText("Pause eingetragen.")).toBeTruthy();
    expect(calls).toEqual(["POST /achievements/rhythm/pauses"]);
  });

  it("US-ACH-04 a pause longer than 4 weeks is refused with its reason and stays visible", async () => {
    showWithWrites(
      answer(),
      () =>
        new Response(JSON.stringify({ error: { code: "achievements.pause_too_long" } }), {
          status: 422,
        }),
    );
    await screen.findByText(/Aktueller Rhythmus/);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Bis (einschließlich)"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause eintragen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/höchstens 4 Wochen/);
  });
});

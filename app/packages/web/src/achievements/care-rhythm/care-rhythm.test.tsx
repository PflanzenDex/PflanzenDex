// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/data";
import { CareRhythmSection } from "./care-rhythm";
import { classesOf, hasOwnBorder, isFilled } from "@/shared/ui/button.roles";

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

/** The section with one of its layers open by its address: "Pflegerhythmus" (`rhythm`) or "Urlaub eintragen" (`pause`). */
function show(status: number, body: unknown, at = "/?sheet=rhythm") {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      expect(new URL(String(url)).pathname).toBe("/achievements/rhythm");
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <CareRhythmSection api="http://api" token={token} />
      </MemoryRouter>
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
        <MemoryRouter initialEntries={["/?sheet=pause"]}>
          <CareRhythmSection api="http://api" token={token} />
        </MemoryRouter>
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
    fireEvent.click(await screen.findByRole("button", { name: /Urlaub vom 01.07.2026 entfernen/ }));
    expect(await screen.findByText("Urlaub entfernt.")).toBeTruthy();
    expect(calls).toEqual(["DELETE /achievements/rhythm/pauses/p1"]);
  });

  it("US-ACH-04 sends the dates of a new pause", async () => {
    const calls = showWithWrites(answer(), (_p, _m, body) => {
      expect(JSON.parse(body)).toEqual({ from: "2026-07-01", until: "2026-07-14" });
      return new Response(JSON.stringify({ id: "p2", from: "2026-07-01", until: "2026-07-14" }), {
        status: 201,
      });
    });
    await screen.findByLabelText("Von");
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Bis (einschließlich)"), {
      target: { value: "2026-07-14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    expect(await screen.findByText("Urlaub eingetragen.")).toBeTruthy();
    expect(calls).toEqual(["POST /achievements/rhythm/pauses"]);
  });

  it("US-QS-32 · US-ACH-04 a refusal of the server for a too long pause stands at its field Bis, with its reason", async () => {
    showWithWrites(
      answer(),
      () =>
        new Response(JSON.stringify({ error: { code: "achievements.pause_too_long" } }), {
          status: 422,
        }),
    );
    await screen.findByLabelText("Von");
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-07-01" } });
    const until = screen.getByLabelText<HTMLInputElement>("Bis (einschließlich)");
    fireEvent.change(until, { target: { value: "2026-07-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Höchstens 4 Wochen: spätestens 28.07.2026.");
    expect(until.getAttribute("aria-invalid")).toBe("true");
    expect(until.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  });

  it("US-QS-32 · US-ACH-04 a pause of seven weeks marks Bis with the last allowed day when it is left, and sends nothing", async () => {
    const calls = showWithWrites(answer(), () => new Response("{}", { status: 201 }));
    await screen.findByLabelText("Von");
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-11-24" } });
    const until = screen.getByLabelText<HTMLInputElement>("Bis (einschließlich)");
    fireEvent.change(until, { target: { value: "2027-01-12" } });
    fireEvent.blur(until);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Höchstens 4 Wochen: spätestens 21.12.2026.",
    );
    expect(until.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
  });

  it("US-QS-32 a new pause starts with today's date (prefilled, US-ACH-04); a typed text that is no day sends nothing", async () => {
    const calls = showWithWrites(
      answer(),
      () => new Response(JSON.stringify({ id: "p3" }), { status: 201 }),
    );
    await screen.findByLabelText("Von");
    const from = screen.getByLabelText("Von") as HTMLInputElement;
    expect(from.value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    fireEvent.change(from, { target: { value: "31.02.2026" } });
    fireEvent.blur(from);
    fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Kein gültiges Datum. Gib es als TT.MM.JJJJ an.",
    );
    expect(calls).toEqual([]);
  });

  it("US-QS-32 · US-ACH-04 a coarse pointer (the system picker) with a seven-week range marks Bis with the last allowed day, takes the focus and sends no request", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const calls = showWithWrites(answer(), () => new Response("{}", { status: 201 }));
      await screen.findByLabelText("Von");
      fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-11-24" } });
      const until = screen.getByLabelText<HTMLInputElement>("Bis (einschließlich)");
      fireEvent.change(until, { target: { value: "2027-01-12" } });
      fireEvent.click(screen.getByRole("button", { name: "Urlaub eintragen" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("Höchstens 4 Wochen: spätestens 21.12.2026.");
      expect(until.getAttribute("aria-invalid")).toBe("true");
      expect(until.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
      expect(document.activeElement).toBe(until);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(calls).toEqual([]);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("US-QS-15 the rhythm beside a pane (issue 1640)", () => {
  it("US-QS-15 the twelve weeks take twelve columns from the width of their layer, not the window: six beside a pane", async () => {
    show(200, answer());
    const list = await screen.findByRole("list", { name: "Die letzten 12 Wochen" });
    expect(list.parentElement?.className.split(" ")).toContain("@container");
    expect(list.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-6", "@md:grid-cols-12"]),
    );
    expect(list.className.split(" ").filter((c) => /^(sm|md|lg|xl):/.test(c))).toEqual([]);
  });
});

describe("US-QS-32 · SG-ICON-01 the weeks are lucide icons with a legend, no glyph text", () => {
  it("US-QS-32 · SG-ICON-01 each week shows its state as one decorative icon and no glyph; its name stays the sr-only text", async () => {
    show(200, answer());
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(5);
    // none, on_time, on_time, open, pending: Minus, Check, Check, CircleDot, Clock (SG-ICON-01).
    expect(
      items.map(
        (li) =>
          li
            .querySelector("svg")
            ?.getAttribute("class")
            ?.match(/lucide-[a-z-]+/)?.[0],
      ),
    ).toEqual([
      "lucide-minus",
      "lucide-check",
      "lucide-check",
      "lucide-circle-dot",
      "lucide-clock",
    ]);
    for (const li of items) {
      expect(li.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(li.textContent).not.toMatch(/[✓•…–]/);
    }
    expect(items[1]?.textContent).toBe("Woche vom 01.02.2026: pünktlich");
  });

  it("US-QS-32 · SG-ICON-01 one visible legend line under the grid pairs each icon with its word", async () => {
    show(200, answer());
    const list = await screen.findByRole("list", { name: "Die letzten 12 Wochen" });
    const legend: [string, string][] = [
      ["pünktlich", "lucide-check"],
      ["offen", "lucide-circle-dot"],
      ["läuft noch", "lucide-clock"],
      ["nichts fällig", "lucide-minus"],
    ];
    for (const [word, icon] of legend) {
      const entry = screen.getByText(word);
      expect(entry.querySelector(`svg.${icon}`)).not.toBeNull();
      expect(entry.closest("ol")).toBeNull();
      expect(entry.className).not.toContain("sr-only");
      expect(list.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe("US-QS-32 · SG-BTN-01 the rhythm pauses: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Urlaub vom … entfernen' is a red plain button of its row, 'Urlaub eintragen' stays the one filled button", async () => {
    const pause = { id: "p1", from: "2026-07-01", until: "2026-07-14" };
    show(200, answer({ pauses: [pause] }), "/?sheet=pause");
    const remove = await screen.findByRole("button", { name: /Urlaub vom 01.07.2026 entfernen/ });
    expect(classesOf(remove)).toContain("text-destructive");
    expect(isFilled(remove)).toBe(false);
    expect(hasOwnBorder(remove)).toBe(false);
    expect(isFilled(screen.getByRole("button", { name: "Urlaub eintragen" }))).toBe(true);
  });
});

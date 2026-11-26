// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINE_HIT } from "@/shared/feedback/line-hit";
import { hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { Context as AnnouncerContext } from "@/shared/platform/announcer/context";
import { WaterAction } from "./water-action";

afterEach(() => {
  cleanup();
  host.remove();
  vi.unstubAllGlobals();
});

/** The line of the overview whose place the result takes (`SlotContext.resultHost`, SG-FEED-05). */
const host = document.createElement("div");
beforeEach(() => document.body.append(host));

const show = (resultHost: HTMLElement | null = host) => {
  const view = render(
    <AnnouncerProvider>
      <WaterAction
        api="http://api"
        token={async () => "tok"}
        specimen={{ id: "e1", name: "Aloe" }}
        resultHost={resultHost}
      />
    </AnnouncerProvider>,
  );
  // The line of the result stands after the button in the page, as under the row of the quick actions (the order of Tab).
  document.body.append(host);
  return view;
};

/** What the shared live region says (DS-69); the toast regions of the test wrapper are no part of it. */
const said = () => document.querySelector(".sr-only[aria-live=polite]")?.textContent?.trim() ?? "";

describe("US-QS-23 Gießen of a plant", () => {
  it("US-QS-23 · US-QS-32 enters the watering through the existing operation and shows its result in place (SG-FEED-01)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ watered: [] }));
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await screen.findByText("Zuletzt gegossen: heute", { selector: "p" });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(new URL(String(url)).pathname).toBe("/watering");
    expect(JSON.parse(String(init?.body))).toMatchObject({ specimenIds: ["e1"] });
  });

  it("US-QS-32 · F-0094 while 'Gießen' runs the button is aria-disabled, not disabled, so it keeps the focus", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        await gate;
        return Response.json({ watered: [] });
      }),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    button.focus();
    await userEvent.click(button);
    await vi.waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    release();
    await screen.findByText("Zuletzt gegossen: heute", { selector: "p" });
  });

  it("US-QS-32 · F-0094 after a successful 'Gießen' the focus stays on the button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ watered: [] })),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    await userEvent.click(button);
    await screen.findByText("Zuletzt gegossen: heute", { selector: "p" });
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("US-QS-23 · P-10 a refusal stays visible with the German text of its code (issue 1644, F8)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: { code: "access.not_signed_in", text: "raw" } }, { status: 401 }),
      ),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    // The refusal is an assertive toast with the German text of its code, never the raw server text (P-10).
    const assertive = () => document.querySelector('[aria-live="assertive"]')?.textContent ?? "";
    await vi.waitFor(() => expect(assertive()).not.toBe(""));
    expect(assertive()).not.toContain("raw");
  });
});

/**
 * A key-enforcing server of the watering route: a key is applied once and its repeat gets the stored answer. The first
 * `lost` answers are lost on the way back (the write is applied, the client sees a network error) (US-QS-03).
 */
function wateringServer(lost: number) {
  const seen = new Map<string, string>();
  const keys: string[] = [];
  const records: string[] = [];
  let left = lost;
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    const body = String(init?.body ?? "");
    keys.push(key);
    if (seen.has(key)) return Response.json({ watered: [] });
    seen.set(key, body);
    records.push(body);
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return Response.json({ watered: [] });
  });
  return { fetchFn, keys, records };
}

describe("US-QS-03 · a daily watering names its local day in its key", () => {
  it("US-QS-03 a lost watering at 23:50 and a watering the next day are two records: the local day names the action", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2026, 10, 20, 23, 50));
      const server = wateringServer(1);
      vi.stubGlobal("fetch", server.fetchFn);
      show();
      fireEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await waitFor(() => expect(server.fetchFn).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Gießen: Aloe" }).getAttribute("aria-disabled"),
        ).not.toBe("true"),
      );
      vi.setSystemTime(new Date(2026, 10, 21, 8, 0));
      fireEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await waitFor(() => expect(server.fetchFn).toHaveBeenCalledTimes(2));
      expect(server.keys[1]).not.toBe(server.keys[0]);
      expect(server.records).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("US-QS-32 Gießen stays in place with its undo (SG-FEED-03)", () => {
  const newEntry = (path: string) =>
    path === "/watering/unwater"
      ? Response.json({ date: "2026-11-20", specimens: ["e1"], removed: 1 })
      : Response.json({ date: "2026-11-20", specimens: ["e1"], created: 1 });

  it("US-QS-32 · SG-FEED-05 a new entry leaves the button where it is and shows 'Gegossen heute · Rückgängig' in the result host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    const { container } = show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    const before = button.outerHTML;
    await userEvent.click(button);
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(undo.closest("p")?.textContent).toBe("Gegossen heute · Rückgängig");
    // The result stands in the host, outside the row of the buttons: the row is the one of before (SG-FEED-05).
    expect(host.contains(undo)).toBe(true);
    expect(container.contains(undo)).toBe(false);
    expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBe(button);
    expect(button.outerHTML).toBe(before);
    expect(container.querySelector("p")).toBeNull();
  });

  it("US-QS-32 · SG-FEED-05 the undo row is one text line high: its button reaches over the line by negative margins, not by height", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(undo.className.split(" ")).toContain(LINE_HIT);
  });

  it("US-QS-15 · issue 2536 · SG-FEED-05 the focus stays on Gießen while the undo shows: no other element is focused, so nothing scrolls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    button.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    await userEvent.click(button);
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(document.activeElement).toBe(button);
    expect(document.activeElement).not.toBe(undo);
    // A `focus()` call is what scrolls a view to its target: nothing but the button of the keeper's own tap gets one.
    expect(focus.mock.contexts.every((target) => target === button)).toBe(true);
    focus.mockRestore();
  });

  it("US-QS-15 · issue 2536 a tap that focuses nothing (Safari and iOS give a button no focus on tap) still leaves the undo unfocused: the view does not scroll to it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(document.activeElement).not.toBe(undo);
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it("US-QS-32 · SG-FEED-05 without a result host the result stands next to the button and its undo takes the focus from the button, as before", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    const { container } = show(null);
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    button.focus();
    await userEvent.click(button);
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(container.contains(undo)).toBe(true);
    expect(host.contains(undo)).toBe(false);
    expect(document.activeElement).toBe(undo);
  });

  it("US-QS-15 · issue 2536 · SG-FEED-05 the result row stands in the host, and the undo of the keyboard follows Gießen by Tab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    await userEvent.click(button);
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(host.contains(undo)).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(undo);
  });

  it("US-QS-32 · SG-BASE-01 the button keeps the focus when the undo window ends, and when the undo ran by a tap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
      );
      show();
      const button = screen.getByRole("button", { name: "Gießen: Aloe" });
      await userEvent.click(button);
      await screen.findByRole("button", { name: "Rückgängig: Aloe" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull();
      expect(document.activeElement).toBe(button);
      await userEvent.click(button);
      expect(document.activeElement).toBe(button);
      await userEvent.click(await screen.findByRole("button", { name: "Rückgängig: Aloe" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull(),
      );
      // A tap focuses the undo (the keeper's own act); when the row goes the focus returns to the button, not to the body.
      expect(document.activeElement).toBe(button);
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · issue 2536 the keyboard path: Tab to Rückgängig and Enter takes the entry back, and the focus returns to Gießen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    await userEvent.click(button);
    await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull(),
    );
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-15 · issue 2536 · SG-FEED-02 · SG-FEED-04 the result is announced once through the shared live region, and the row adds no live region", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    const announce = vi.fn();
    render(
      <AnnouncerContext.Provider value={{ announce, buffer: vi.fn(), note: null }}>
        <WaterAction
          api="http://api"
          token={async () => "tok"}
          specimen={{ id: "e1", name: "Aloe" }}
          resultHost={host}
        />
      </AnnouncerContext.Provider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith("Gegossen heute. Rückgängig möglich.");
    // The row has no `aria-live`, no `role="status"` and no `role="alert"` above it: the announcer is the one channel.
    expect(undo.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(host.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
  });

  it("US-QS-32 'Rückgängig' takes the entry back with one request to the undo route, and the result row goes", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname));
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig: Aloe" }));
    await waitFor(() => expect(host.textContent).toBe(""));
    expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBeTruthy();
    const paths = fetchFn.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["/watering", "/watering/unwater"]);
    const undoBody = JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body));
    expect(undoBody).toMatchObject({ specimenIds: ["e1"] });
  });

  it("US-QS-32 the undo is gone after 8 s without a tap: the result row is empty and the button was there all along", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
      );
      show();
      const button = screen.getByRole("button", { name: "Gießen: Aloe" });
      await userEvent.click(button);
      await screen.findByRole("button", { name: "Rückgängig: Aloe" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull();
      expect(host.textContent).toBe("");
      expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBe(button);
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · SG-FEED-01 a watering that was already entered today has nothing to undo: its result is the line 'Zuletzt gegossen: heute', announced once, no toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ date: "2026-11-20", specimens: ["e1"], created: 0 }),
      ),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 20, 12));
      show();
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      const line = await screen.findByText("Zuletzt gegossen: heute", { selector: "p" });
      expect(said()).toBe("Zuletzt gegossen: heute");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull();
      // The line stands in the result host, not in the row of the buttons: it covers no button and adds no row (SG-FEED-05).
      expect(host.contains(line)).toBe(true);
      expect(
        screen.getByRole("button", { name: "Gießen: Aloe" }).parentElement?.contains(line),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · date-and-timezone the line says 'gestern' for an entry of the day before, read against the keeper's day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ date: "2026-11-19", specimens: ["e1"], created: 0 }),
      ),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 10, 20, 12));
      show();
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await screen.findByText("Zuletzt gegossen: gestern", { selector: "p" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · SG-FEED-02 the line of an earlier write does not come back: a later watering that made an entry clears it for good", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let created = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async () =>
          Response.json({ date: "2026-11-20", specimens: ["e1"], created }),
        ),
      );
      vi.setSystemTime(new Date(2026, 10, 20, 12));
      show();
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await screen.findByText("Zuletzt gegossen: heute", { selector: "p" });
      created = 1;
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await screen.findByRole("button", { name: "Rückgängig: Aloe" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBeTruthy();
      expect(screen.queryByText(/Zuletzt gegossen/, { selector: "p" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 · SG-FEED-02 a new entry is said once, by its undo row: no second line follows when the 8 s are over", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
      );
      show();
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await screen.findByRole("button", { name: "Rückgängig: Aloe" });
      expect(said()).toBe("Gegossen heute. Rückgängig möglich.");
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBeTruthy();
      expect(screen.queryByText("Zuletzt gegossen: heute", { selector: "p" })).toBeNull();
      expect(said()).toBe("Gegossen heute. Rückgängig möglich.");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("US-QS-32 · SG-FEED-05 the button stays while the undo shows", () => {
  it("US-QS-32 · SG-FEED-02 a second tap while the undo is open does not bring 'Zuletzt gegossen: heute' back after the undo took the entry away", async () => {
    let created = 1;
    const fetchFn = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/watering/unwater"
        ? Response.json({ date: "2026-11-20", specimens: ["e1"], removed: 1 })
        : Response.json({ date: "2026-11-20", specimens: ["e1"], created }),
    );
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    created = 0;
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig: Aloe" }));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull(),
    );
    expect(host.textContent).toBe("");
  });

  it("US-QS-32 · SG-FEED-05 without a result host the result stands next to the button, so it is never lost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ date: "2026-11-20", specimens: ["e1"], created: 0 }),
      ),
    );
    const { container } = show(null);
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const line = await screen.findByText(/^Zuletzt gegossen: /, { selector: "p" });
    expect(container.contains(line)).toBe(true);
    expect(host.textContent).toBe("");
  });
});

describe("US-QS-32 the undo takes the day of its write and says when nothing was left", () => {
  it("US-QS-32 Rückgängig sends the date the write used; removed 0 is said honestly, not as restored", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) =>
      new URL(String(url)).pathname === "/watering/unwater"
        ? Response.json({ date: "2026-11-19", specimens: ["e1"], removed: 0 })
        : Response.json({ date: "2026-11-19", specimens: ["e1"], created: 1 }),
    );
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig: Aloe" }));
    await vi.waitFor(() =>
      expect(said()).toBe("Nichts mehr rückgängig zu machen – der Eintrag ist schon weg."),
    );
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toMatchObject({
      specimenIds: ["e1"],
      date: "2026-11-19",
    });
  });
});

describe("US-QS-32 · SG-BTN-01 the watering button of a plant is tinted, not outlined (FX-39 sweep 3)", () => {
  it("US-QS-32 · SG-BTN-01 'Gießen' is a tinted button without a border", () => {
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    expect(isTinted(button)).toBe(true);
    expect(hasOwnBorder(button)).toBe(false);
  });
});

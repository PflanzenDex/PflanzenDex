// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterAction } from "./water-action";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () =>
  render(
    <WaterAction
      api="http://api"
      token={async () => "tok"}
      specimen={{ id: "e1", name: "Aloe" }}
    />,
  );

describe("US-QS-23 Gießen of a plant", () => {
  it("US-QS-23 enters the watering through the existing operation and confirms it as a toast with role=status (issue 1644, F8)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ watered: [] }));
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const confirmation = await screen.findByRole("status");
    expect(confirmation.textContent).toBe("„Aloe“ als gegossen eingetragen.");
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
    await screen.findByRole("status");
  });

  it("US-QS-32 · F-0094 after a successful 'Gießen' the focus stays on the button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ watered: [] })),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    await userEvent.click(button);
    await screen.findByRole("status");
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

  it("US-QS-32 a new entry turns the button into 'Gegossen heute · Rückgängig' in place", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(undo.closest("p")?.textContent).toBe("Gegossen heute · Rückgängig");
    expect(screen.queryByRole("button", { name: "Gießen: Aloe" })).toBeNull();
  });

  it("US-QS-32 the undo takes the focus the button had, so the focus is not lost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
    );
    show();
    const button = screen.getByRole("button", { name: "Gießen: Aloe" });
    button.focus();
    await userEvent.click(button);
    const undo = await screen.findByRole("button", { name: "Rückgängig: Aloe" });
    expect(document.activeElement).toBe(undo);
  });

  it("US-QS-32 'Rückgängig' takes the entry back with one request to the undo route, and the button returns", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname));
    vi.stubGlobal("fetch", fetchFn);
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig: Aloe" }));
    await screen.findByRole("button", { name: "Gießen: Aloe" });
    const paths = fetchFn.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(["/watering", "/watering/unwater"]);
    const undoBody = JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body));
    expect(undoBody).toMatchObject({ specimenIds: ["e1"] });
  });

  it("US-QS-32 the undo is gone after 8 s without a tap: the button is back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>(async (url) => newEntry(new URL(String(url)).pathname)),
      );
      show();
      await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
      await screen.findByRole("button", { name: "Rückgängig: Aloe" });
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull();
      expect(screen.getByRole("button", { name: "Gießen: Aloe" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-32 a watering that was already entered today has nothing to undo: the result stays a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ date: "2026-11-20", specimens: ["e1"], created: 0 }),
      ),
    );
    show();
    await userEvent.click(screen.getByRole("button", { name: "Gießen: Aloe" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "„Aloe“ als gegossen eingetragen.",
    );
    expect(screen.queryByRole("button", { name: "Rückgängig: Aloe" })).toBeNull();
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
    expect((await screen.findByRole("status")).textContent).toBe(
      "Nichts mehr rückgängig zu machen – der Eintrag ist schon weg.",
    );
    expect(JSON.parse(String(fetchFn.mock.calls[1]?.[1]?.body))).toMatchObject({
      specimenIds: ["e1"],
      date: "2026-11-19",
    });
  });
});

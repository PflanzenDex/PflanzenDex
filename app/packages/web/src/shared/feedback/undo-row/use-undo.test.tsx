// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Context } from "@/shared/platform/announcer/context";
import { UNDO_MS, placeHeld, useUndo, type Held } from "./use-undo";

type Row = { id: string; name: string };
const row = (id: string): Row => ({ id, name: `Pflanze ${id}` });

let announce = vi.fn<(text: string, shown?: string | null) => void>();
const wrapper = ({ children }: { children: ReactNode }) => (
  <Context.Provider
    value={{ announce, buffer: async () => ({ ok: true as const, value: undefined }), note: null }}
  >
    {children}
  </Context.Provider>
);

beforeEach(() => {
  vi.useFakeTimers();
  announce = vi.fn<(text: string, shown?: string | null) => void>();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("US-QS-32 useUndo holds a changed item in place", () => {
  it("US-QS-32 holds the item with its result text and says the result once to screen readers", () => {
    const { result } = renderHook(() => useUndo<Row>(), { wrapper });
    act(() =>
      result.current.hold(
        [{ key: "a", group: "a", item: row("a"), index: 2, undoable: true }],
        "Erledigt",
      ),
    );
    expect(result.current.held).toEqual([
      expect.objectContaining({
        key: "a",
        index: 2,
        result: "Erledigt",
        undoable: true,
        item: row("a"),
      }),
    ]);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Erledigt");
  });

  it("US-QS-32 the hold is gone after the undo window of 8 s (UNDO_MS = 8000), without any further write", () => {
    expect(UNDO_MS).toBe(8000);
    const { result } = renderHook(() => useUndo<Row>(), { wrapper });
    act(() =>
      result.current.hold(
        [{ key: "a", group: "a", item: row("a"), index: 0, undoable: true }],
        "Erledigt",
      ),
    );
    act(() => vi.advanceTimersByTime(UNDO_MS - 1));
    expect(result.current.held).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.held).toEqual([]);
  });

  it("US-QS-32 release takes the whole group back at once and cancels its timers", () => {
    const { result } = renderHook(() => useUndo<Row>(), { wrapper });
    act(() =>
      result.current.hold(
        [
          { key: "a", group: "bulk", item: row("a"), index: 0, undoable: true },
          { key: "b", group: "bulk", item: row("b"), index: 1, undoable: false },
          { key: "c", group: "single", item: row("c"), index: 2, undoable: true },
        ],
        "Umgestellt",
      ),
    );
    act(() => result.current.release("bulk"));
    expect(result.current.held.map((h) => h.key)).toEqual(["c"]);
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(result.current.held).toEqual([]);
  });

  it("US-QS-32 a new hold of the same key starts the 8 s again and replaces the old hold", () => {
    const { result } = renderHook(() => useUndo<Row>(), { wrapper });
    act(() =>
      result.current.hold(
        [{ key: "a", group: "a", item: row("a"), index: 0, undoable: true }],
        "Erledigt",
      ),
    );
    act(() => vi.advanceTimersByTime(UNDO_MS - 1000));
    act(() =>
      result.current.hold(
        [{ key: "a", group: "a", item: row("a"), index: 0, undoable: true }],
        "Gegossen",
      ),
    );
    expect(result.current.held.map((h) => h.result)).toEqual(["Gegossen"]);
    act(() => vi.advanceTimersByTime(UNDO_MS - 1000));
    expect(result.current.held).toHaveLength(1);
  });
});

describe("US-QS-32 placeHeld keeps the list's shape until the hold ends", () => {
  const held = (key: string, index: number): Held<Row> => ({
    key,
    group: key,
    item: row(key),
    index,
    result: "Erledigt",
    undoable: true,
  });

  it("US-QS-32 puts the held item back at its index and drops the server row with the same key", () => {
    const rows = [row("x"), row("y"), row("z")];
    // The server no longer lists "b" (it is done); the list keeps "b" at index 1 until the hold ends.
    const shown = placeHeld(rows, [held("b", 1)], (r) => r.id);
    expect(shown.map((r) => r.id)).toEqual(["x", "b", "y", "z"]);
    const deduped = placeHeld([row("x"), row("b")], [held("b", 0)], (r) => r.id);
    expect(deduped.map((r) => r.id)).toEqual(["b", "x"]);
  });

  it("US-QS-32 without holds the server rows are the list", () => {
    const rows = [row("x"), row("y")];
    expect(placeHeld(rows, [], (r) => r.id)).toEqual(rows);
  });
});

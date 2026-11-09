// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWrite,
  newRepeatKey,
  useWriteAction,
  type Response as ApiResponse,
} from "@/shared/data";
import { AnnouncerProvider } from "./announcer";
import { deliverBuffered } from "./outbox";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // The buffer is shared by the whole page: leave it empty for the next test.
  await deliverBuffered();
});

const online = (state: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(state);
/** The visible text of the notice; the live region repeats it for screen readers. */
const visible = (text: string) =>
  screen.getAllByText(text).filter((el) => !el.closest("[aria-live]"));
/** What a screen reader is told (a repeated message carries a trailing no-break space). */
const heard = () => region()?.textContent?.replace(/\u00A0$/, "");
const buffered = () => waitFor(() => expect(heard()).toMatch(/^Du bist offline/));
const region = () => document.querySelector<HTMLElement>("[aria-live=polite]");

/** One tap that writes, shown the way a page does: a button that runs the action. */
function Page(props: {
  send: (token: string, key: string) => Promise<ApiResponse<unknown>>;
  after: () => void;
}) {
  const write = useWriteAction(async () => "token", props.after);
  return (
    <>
      <button type="button" onClick={() => void write.run(props.send, "Gespeichert: Monstera.")}>
        Speichern
      </button>
      <p>{write.running ? "läuft" : "bereit"}</p>
    </>
  );
}

const shell = (
  send: (token: string, key: string) => Promise<ApiResponse<unknown>>,
  after = vi.fn(),
) =>
  render(
    <AnnouncerProvider>
      <Page send={send} after={after} />
    </AnnouncerProvider>,
  );

describe("US-QS-10 · offline writes are announced and visible as text (4.1.3, P-10)", () => {
  it("US-QS-10 offline a write is not sent, the buffered state is visible text and announced, the focus stays", async () => {
    online(false);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    shell(send);
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.click(button);
    expect(send).not.toHaveBeenCalled();
    const text =
      "Du bist offline. Wird gesendet, sobald du wieder online bist: Gespeichert: Monstera.";
    await waitFor(() => expect(heard()).toBe(text));
    expect(visible(text)).toHaveLength(1);
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 when the network returns the write is delivered once, and the delivery is visible text and announced", async () => {
    online(false);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    const after = vi.fn();
    shell(send, after);
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.click(button);
    await userEvent.click(button);
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    const text = "Nachträglich gesendet: Gespeichert: Monstera.";
    await waitFor(() => expect(heard()).toBe(text));
    expect(visible(text)).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 a double tap while offline buffers one write, not two (no duplicate entry)", async () => {
    online(false);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    shell(send);
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.dblClick(button);
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it("US-QS-10 a refused delivery stays visible with the text of its code and is announced (P-10)", async () => {
    online(false);
    const send = vi.fn(async () => ({
      ok: false as const,
      error: { code: "access.denied", text: "raw" },
    }));
    shell(send as never);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toMatch(/^Nicht gesendet: /));
    expect(visible(heard() ?? "")).toHaveLength(1);
    expect(heard()).toContain("Darauf hast du keinen Zugriff.");
    expect(screen.queryByText(/raw/)).toBeNull();
  });

  it("US-QS-10 still without a network the delivery waits and the write stays buffered", async () => {
    online(false);
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "network.not_reachable", text: "x" },
      })
      .mockResolvedValue({ ok: true, value: {} });
    shell(send);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(heard()).toMatch(/^Du bist offline/);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("US-QS-10 online a write is sent at once and nothing is buffered", async () => {
    online(true);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(send, "Gespeichert."));
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.message).toBe("Gespeichert.");
  });

  it("US-QS-10 the delivered note goes away after a while, a waiting one stays until it is delivered", async () => {
    online(false);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    shell(send);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
      expect(
        visible(
          "Du bist offline. Wird gesendet, sobald du wieder online bist: Gespeichert: Monstera.",
        ),
      ).toHaveLength(1);
      online(true);
      act(() => void window.dispatchEvent(new Event("online")));
      await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
      expect(visible("Nachträglich gesendet: Gespeichert: Monstera.")).toHaveLength(1);
      await act(async () => void (await vi.advanceTimersByTimeAsync(31_000)));
      expect(
        screen.queryAllByText(/^Nachträglich gesendet/).filter((el) => !el.closest("[aria-live]")),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-QS-10 without an announcer a write is sent as before, offline too", async () => {
    online(false);
    const send = vi.fn(async () => ({ ok: true as const, value: {} }));
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(send, "Gespeichert."));
    expect(send).toHaveBeenCalledTimes(1);
  });
});

/**
 * A server that keeps one record per Idempotency-Key, as the API does (its replay test in `care/measurements.test.ts`):
 * the same key with another request is refused as `idempotency.key_conflict` and nothing is written. The first `lost`
 * answers are lost on the way back: the record exists, the client sees a network error.
 */
function serverLosing(lost: number) {
  const records = new Map<string, { url: string; body: unknown }>();
  const keys: string[] = [];
  let left = lost;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
    keys.push(key);
    const request = {
      url: String(url),
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    };
    const seen = records.get(key);
    if (seen && JSON.stringify(seen) !== JSON.stringify(request))
      return new Response(
        JSON.stringify({ error: { code: "idempotency.key_conflict", text: "x" } }),
        { status: 409 },
      );
    records.set(key, request);
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify({ id: key }), { status: 201 });
  });
  return { fetchFn, records, keys };
}

/** A measurement write, sent with the key of its action (without one, the write gets a key of its own). */
const measurement = (value: number) => (t: string, fetchFn: typeof fetch, key?: string) =>
  createWrite("http://api", t, fetchFn, key)("POST", "/measurements", { value });

/** The send a page hands to `useWriteAction`: the hook's key of the action goes to the write. */
const sendMeasurement = (value: number, fetchFn: typeof fetch) => (t: string, key: string) =>
  measurement(value)(t, fetchFn, key);

describe("US-QS-03 · a repeat of a write whose answer was lost carries its Idempotency-Key", () => {
  it("US-QS-03 a buffered write whose answer was lost is sent again with the same key: one record", async () => {
    online(false);
    const server = serverLosing(1);
    shell(sendMeasurement(9, server.fetchFn));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    online(true);
    await deliverBuffered();
    expect(server.keys).toHaveLength(1);
    await deliverBuffered();
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
    expect(server.keys).toHaveLength(2);
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(server.records.size).toBe(1);
  });

  it("US-QS-03 a retry by the user after a lost answer sends the same key: one record", async () => {
    online(true);
    const server = serverLosing(1);
    const save = sendMeasurement(9, server.fetchFn);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(save, "Gespeichert."));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(save, "Gespeichert."));
    expect(result.current.error).toBeNull();
    expect(server.keys).toHaveLength(2);
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(server.records.size).toBe(1);
  });

  it("US-QS-03 a second tap after a confirmed write is a new write with a key of its own", async () => {
    online(true);
    const server = serverLosing(0);
    const save = sendMeasurement(9, server.fetchFn);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(save, "Gespeichert."));
    await act(async () => result.current.run(save, "Gespeichert."));
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a changed form after a lost answer reuses the key: the server refuses it as a key conflict, the next tap is a new write", async () => {
    online(true);
    const server = serverLosing(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(sendMeasurement(9, server.fetchFn), "a"));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(sendMeasurement(10, server.fetchFn), "b"));
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    await act(async () => result.current.run(sendMeasurement(10, server.fetchFn), "b"));
    expect(result.current.error).toBeNull();
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a refused write is definitive: its identical retry gets a new key", async () => {
    online(true);
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "input.invalid", text: "x" } }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    const save = sendMeasurement(9, fetchFn);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(save, "Gespeichert."));
    await act(async () => result.current.run(save, "Gespeichert."));
    const keys = fetchFn.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("US-QS-03 a queued write whose answer was lost keeps its key when a newer write succeeds: its redelivery sends the same key", async () => {
    online(false);
    const server = serverLosing(1);
    shell(sendMeasurement(9, server.fetchFn));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    online(true);
    await deliverBuffered(); // applied, the answer is lost: the write stays queued with its key
    expect(server.keys).toHaveLength(1);
    await measurement(10)("token", server.fetchFn); // a newer write succeeds
    await deliverBuffered(); // the redelivery of the queued write
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
    expect(server.keys).toHaveLength(3);
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 an older write still in flight keeps its key when a newer write succeeds: its tap after the lost answer sends the same key", async () => {
    online(true);
    let release = () => {};
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const keys: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const key = (init?.headers as Record<string, string>)["Idempotency-Key"] ?? "";
      keys.push(key);
      if (keys.length === 1) {
        // The older write reaches the server; its answer comes back late and is lost.
        await gate;
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify({ id: key }), { status: 201 });
    });
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    let older: Promise<void> = Promise.resolve();
    act(() => {
      older = result.current.run(sendMeasurement(9, fetchFn), "a");
    });
    await vi.waitFor(() => expect(keys).toHaveLength(1));
    await measurement(10)("token", fetchFn); // the newer write succeeds while the older one is in flight
    expect(keys).toHaveLength(2);
    await act(async () => {
      release();
      await older;
    });
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(sendMeasurement(9, fetchFn), "a"));
    expect(result.current.error).toBeNull();
    expect(keys[2]).toBe(keys[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it("US-QS-03 an identical write without an action key is a new write: createWrite compares no content", async () => {
    const server = serverLosing(1);
    const write = createWrite("http://api", "tok", server.fetchFn);
    await write("POST", "/measurements", { value: 1 }); // lost
    await write("POST", "/measurements", { value: 1 }); // the same content, but no action: a new write
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a write whose answer was lost does not swallow a later write: on, off, on again is applied", async () => {
    const server = serverLosing(1);
    const write = createWrite("http://api", "tok", server.fetchFn);
    await write("PUT", "/share", { share: true }); // applied, the answer is lost
    await write("PUT", "/share", { share: false }); // the user moved on
    await write("PUT", "/share", { share: true }); // the same write again: a new write
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect([...server.records.values()].at(-1)).toMatchObject({ body: { share: true } });
  });

  it("US-QS-03 the same across two paths: archive lost, restore succeeds, archive again is applied", async () => {
    const server = serverLosing(1);
    const write = createWrite("http://api", "tok", server.fetchFn);
    await write("POST", "/specimens/e1/archive", { timeZone: "Europe/Berlin" });
    await write("POST", "/specimens/e1/restore");
    await write("POST", "/specimens/e1/archive", { timeZone: "Europe/Berlin" });
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect([...server.records.values()].at(-1)).toMatchObject({
      url: "http://api/specimens/e1/archive",
    });
  });

  it("US-QS-03 two writes whose answers were lost: delivering the older one with its key leaves the newer one's key in place", async () => {
    const server = serverLosing(2);
    const older = newRepeatKey();
    const newer = newRepeatKey();
    const write = (value: number, key: string) =>
      createWrite("http://api", "tok", server.fetchFn, key)("POST", "/measurements", { value });
    await write(1, older); // lost
    await write(2, newer); // lost
    await write(1, older); // older delivered: succeeds
    await write(2, newer); // newer delivered again
    expect(server.keys).toEqual([older, newer, older, newer]);
    expect(server.records.size).toBe(2);
  });
});

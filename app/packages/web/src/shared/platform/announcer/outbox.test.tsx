// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWrite, useWriteAction, type WriteOptions, type WriteSend } from "@/shared/data";
import { AnnouncerProvider } from "./announcer";
import { deliverBuffered } from "./outbox";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // The buffer is shared by the whole page: leave it empty for the next test.
  await deliverBuffered();
  vi.unstubAllGlobals();
});

const online = (state: boolean) =>
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(state);
/** The visible text of the notice; the live region repeats it for screen readers. */
const visible = (text: string) =>
  screen.getAllByText(text).filter((el) => !el.closest("[aria-live]"));
/** What a screen reader is told (a repeated message carries a trailing no-break space). */
const heard = () => region()?.textContent?.replace(/ $/, "");
const buffered = () => waitFor(() => expect(heard()).toMatch(/^Du bist offline/));
const region = () => document.querySelector<HTMLElement>("[aria-live=polite]");

/** The server of a test: each call gets the next answer, an Error is a lost answer. The buffer delivers over the global fetch. */
function serverWith(...answers: (Response | Error)[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    const next = answers.shift() ?? new Response("{}", { status: 201 });
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const ok = () => new Response("{}", { status: 201 });
const lost = () => new TypeError("Failed to fetch");
const refusedWith = (code: string) =>
  new Response(JSON.stringify({ error: { code, text: "raw" } }), { status: 403 });

/** One tap that writes, shown the way a page does: a button that runs the action. */
function Page(props: { send: WriteSend; after: () => void }) {
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

const shell = (send: WriteSend, after = vi.fn()) =>
  render(
    <AnnouncerProvider>
      <Page send={send} after={after} />
    </AnnouncerProvider>,
  );

/** The write of the tests: a measurement through the API layer, so an offline tap is buffered with its key (US-QS-10). */
const measure =
  (value: number): WriteSend =>
  (t, options: WriteOptions) =>
    createWrite<unknown>("http://api", t, options)("POST", "/measurements", { value });

describe("US-QS-10 · offline writes are announced and visible as text (4.1.3, P-10)", () => {
  it("US-QS-10 offline a write is not sent, the buffered state is visible text and announced, the focus stays", async () => {
    online(false);
    const fetchFn = serverWith();
    shell(measure(9));
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.click(button);
    expect(fetchFn).not.toHaveBeenCalled();
    const text =
      "Du bist offline. Wird gesendet, sobald du wieder online bist: Gespeichert: Monstera.";
    await waitFor(() => expect(heard()).toBe(text));
    expect(visible(text)).toHaveLength(1);
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 when the network returns the write is delivered once, and the delivery is visible text and announced", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    const after = vi.fn();
    shell(measure(9), after);
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.click(button);
    await userEvent.click(button);
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    const text = "Nachträglich gesendet: Gespeichert: Monstera.";
    await waitFor(() => expect(heard()).toBe(text));
    expect(visible(text)).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 a double tap while offline buffers one write, not two (no duplicate entry)", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    shell(measure(9));
    const button = screen.getByRole("button", { name: "Speichern" });
    await userEvent.dblClick(button);
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
  });

  it("US-QS-10 a refused delivery stays visible with the text of its code and is announced (P-10)", async () => {
    online(false);
    serverWith(refusedWith("access.denied"));
    shell(measure(9));
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
    const fetchFn = serverWith(lost(), ok());
    shell(measure(9));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(heard()).toMatch(/^Du bist offline/);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("US-QS-10 online a write is sent at once and nothing is buffered", async () => {
    online(true);
    const fetchFn = serverWith(ok());
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(measure(9), "Gespeichert."));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.message).toBe("Gespeichert.");
  });

  it("US-QS-10 the delivered note goes away after a while, a waiting one stays until it is delivered", async () => {
    online(false);
    serverWith(ok());
    shell(measure(9));
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

  it("US-QS-10 without an announcer an offline write is refused, not sent (US-QS-30)", async () => {
    online(false);
    const fetchFn = serverWith();
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(measure(9), "Gespeichert."));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.error?.code).toBe("network.not_reachable");
  });
});

/**
 * A server that keeps one record per Idempotency-Key, as the API does (its replay test in `care/measurements.test.ts`).
 * The first `lost` answers are lost on the way back: the record exists, the client sees a network error. With `strict`
 * the server refuses a key that comes back with another body (`idempotency.key_conflict`).
 */
function serverLosing(lost: number, strict = false) {
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
    if (strict && seen && JSON.stringify(seen) !== JSON.stringify(request))
      return new Response(
        JSON.stringify({ error: { code: "idempotency.key_conflict", text: "x" } }),
        {
          status: 409,
        },
      );
    if (!seen) records.set(key, request);
    if (left > 0) {
      left -= 1;
      throw new TypeError("Failed to fetch");
    }
    return new Response(JSON.stringify({ id: key }), { status: 201 });
  });
  return { fetchFn, records, keys };
}

/** A send of a page on a measurement of the test server; the options of the action go on to the write (US-QS-03). */
const measureOn =
  (server: { fetchFn: typeof fetch }, value: number): WriteSend =>
  (t, options) =>
    measure(value)(t, { ...options, fetchFn: server.fetchFn });

describe("US-QS-03 · a repeat of a write whose answer was lost carries its Idempotency-Key", () => {
  it("US-QS-03 a buffered write whose answer was lost is sent again with the same key: one record", async () => {
    online(false);
    const server = serverLosing(1);
    vi.stubGlobal("fetch", server.fetchFn);
    shell(measureOn(server, 9));
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
    const save = measureOn(server, 9);
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
    const save = measureOn(server, 9);
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

  it("US-QS-03 a lost answer on one row is not repeated by a tap on another row: the other row gets a key of its own, the first row's retap reuses its key", async () => {
    online(true);
    const server = serverLosing(1);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(measureOn(server, 1), "a", "row-a"));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(measureOn(server, 2), "b", "row-b"));
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    await act(async () => result.current.run(measureOn(server, 1), "a", "row-a"));
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a retry with an edited form keeps the key: the server refuses it as idempotency.key_conflict, the error stays on the page", async () => {
    online(true);
    const server = serverLosing(1, true);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(measureOn(server, 9), "a"));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(measureOn(server, 10), "b"));
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
  });

  it("US-QS-03 a refused write is definitive: its identical retry gets a new key", async () => {
    online(true);
    const fetchFn = serverWith(refusedWith("input.invalid"), ok());
    const save = measureOn({ fetchFn }, 9);
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
    vi.stubGlobal("fetch", server.fetchFn);
    shell(measureOn(server, 9));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await buffered();
    online(true);
    await deliverBuffered(); // applied, the answer is lost: the write stays queued with its key
    expect(server.keys).toHaveLength(1);
    await createWrite("http://api", "token", { fetchFn: server.fetchFn, key: "newer" })(
      "POST",
      "/measurements",
      { value: 10 },
    ); // a newer write succeeds
    await deliverBuffered(); // the redelivery of the queued write
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
    expect(server.keys).toHaveLength(3);
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a write whose answer was lost does not swallow a later write: on, off, on again is applied", async () => {
    const server = serverLosing(1);
    // Each action has its own key (US-QS-03): the on, the off and the second on are three actions.
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "on" })(
      "PUT",
      "/share",
      { share: true },
    ); // applied, the answer is lost
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "off" })(
      "PUT",
      "/share",
      { share: false },
    ); // the user moved on
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "on-again" })(
      "PUT",
      "/share",
      { share: true },
    ); // a new action: a new write
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect([...server.records.values()].at(-1)).toMatchObject({ body: { share: true } });
  });

  it("US-QS-03 the same across two paths: archive lost, restore succeeds, archive again is applied", async () => {
    const server = serverLosing(1);
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "archive" })(
      "POST",
      "/specimens/e1/archive",
      { timeZone: "Europe/Berlin" },
    );
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "restore" })(
      "POST",
      "/specimens/e1/restore",
    );
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "archive-again" })(
      "POST",
      "/specimens/e1/archive",
      { timeZone: "Europe/Berlin" },
    );
    expect(server.keys[2]).not.toBe(server.keys[0]);
    expect([...server.records.values()].at(-1)).toMatchObject({
      url: "http://api/specimens/e1/archive",
    });
  });

  it("US-QS-03 two writes whose answers were lost: delivering the older one leaves the newer one's key in place", async () => {
    const server = serverLosing(2);
    const older = createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "older" });
    const newer = createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "newer" });
    await older("POST", "/measurements", { value: 1 }); // older, lost
    await newer("POST", "/measurements", { value: 2 }); // newer, lost
    await older("POST", "/measurements", { value: 1 }); // older delivered again: succeeds
    await newer("POST", "/measurements", { value: 2 }); // newer delivered again
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(server.keys[3]).toBe(server.keys[1]);
    expect(server.records.size).toBe(2);
  });
});

describe("US-QS-30 · a write through useWriteAction stays active offline", () => {
  it("US-QS-30 · offline the buffered write control is active, buffers the write and is not refused", async () => {
    online(false);
    const fetchFn = serverWith();
    shell(measure(9));
    const button = screen.getByRole("button", { name: "Speichern" });
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(button);
    expect(fetchFn).not.toHaveBeenCalled();
    await buffered();
    expect(screen.queryByText(/Keine Verbindung/)).toBeNull();
  });
});

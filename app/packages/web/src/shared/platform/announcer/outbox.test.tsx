// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendKey,
  createWrite,
  useWriteAction,
  type KeyScope,
  type WriteOptions,
  type WriteSend,
} from "@/shared/data";
import { AnnouncerProvider } from "./announcer";
import { deliverBuffered } from "./outbox";

// The device is signed in as account A for every test; the account tests change it (US-QS-07).
beforeEach(() => signInAs("A"));

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // The buffer is shared by the whole page: leave it empty for the next test.
  await deliverBuffered();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

/** The sign-in library keeps the signed-in user under this key (oidc-client-ts, `sub` is the account; US-QS-07). */
const USER_KEY = "oidc.user:http://localhost:18081/realms/pflanzendex:pflanzendex-web";
/** Signs the device in as account `sub`, or out for `null`, the way the sign-in library keeps its user (US-QS-07). */
function signInAs(sub: string | null) {
  if (sub === null) window.localStorage.removeItem(USER_KEY);
  else
    window.localStorage.setItem(
      USER_KEY,
      JSON.stringify({ access_token: `token-of-${sub}`, profile: { sub } }),
    );
}
/** The token of the session as `useSession` gives it: the access token of the user the device keeps (US-QS-07). */
const sessionToken = async () =>
  (JSON.parse(window.localStorage.getItem(USER_KEY) ?? "null") as { access_token?: string } | null)
    ?.access_token;

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

/** The action of the test page's save: one target (the page), one action (US-QS-03). */
const page: KeyScope = { target: "page", action: "save" };

/** One tap that writes, shown the way a page does: a button that runs the action. */
function Page(props: {
  send: WriteSend;
  after: () => void;
  token?: (() => Promise<string | undefined>) | undefined;
}) {
  const write = useWriteAction(props.token ?? (async () => "token"), props.after);
  return (
    <>
      <button
        type="button"
        onClick={() => void write.run(props.send, "Gesichert: Monstera.", page)}
      >
        Sichern
      </button>
      <p>{write.running ? "läuft" : "bereit"}</p>
    </>
  );
}

const shell = (send: WriteSend, after = vi.fn(), token?: () => Promise<string | undefined>) =>
  render(
    <AnnouncerProvider>
      <Page send={send} after={after} token={token} />
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
    const button = screen.getByRole("button", { name: "Sichern" });
    await userEvent.click(button);
    expect(fetchFn).not.toHaveBeenCalled();
    const text =
      "Du bist offline. Wird gesendet, sobald du wieder online bist: Gesichert: Monstera.";
    await waitFor(() => expect(heard()).toBe(text));
    expect(visible(text)).toHaveLength(1);
    expect(document.activeElement).toBe(button);
  });

  it("US-QS-10 when the network returns the write is delivered once, and the delivery is visible text and announced", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    const after = vi.fn();
    shell(measure(9), after);
    const button = screen.getByRole("button", { name: "Sichern" });
    await userEvent.click(button);
    await userEvent.click(button);
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    const text = "Nachträglich gesendet: Gesichert: Monstera.";
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
    const button = screen.getByRole("button", { name: "Sichern" });
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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
    await act(async () => result.current.run(measure(9), "Gesichert.", page));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.message).toBe("Gesichert.");
  });

  it("US-QS-10 the delivered note goes away after a while, a waiting one stays until it is delivered", async () => {
    online(false);
    serverWith(ok());
    shell(measure(9));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
      expect(
        visible(
          "Du bist offline. Wird gesendet, sobald du wieder online bist: Gesichert: Monstera.",
        ),
      ).toHaveLength(1);
      online(true);
      act(() => void window.dispatchEvent(new Event("online")));
      await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
      expect(visible("Nachträglich gesendet: Gesichert: Monstera.")).toHaveLength(1);
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
    await act(async () => result.current.run(measure(9), "Gesichert.", page));
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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
    const server = serverLosing(1, true);
    const save = measureOn(server, 9);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(save, "Gesichert.", page));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(save, "Gesichert.", page));
    expect(result.current.error).toBeNull();
    expect(server.keys).toHaveLength(2);
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(server.records.size).toBe(1);
  });

  it("US-QS-03 a second tap after a confirmed write is a new write with a key of its own", async () => {
    online(true);
    const server = serverLosing(0, true);
    const save = measureOn(server, 9);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(save, "Gesichert.", page));
    await act(async () => result.current.run(save, "Gesichert.", page));
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 a lost answer on row A, a tap on row B, then a retap on A: B gets a key of its own, A's retap repeats A's key", async () => {
    online(true);
    const server = serverLosing(1, true);
    const rowA: KeyScope = { target: "row-a", action: "save" };
    const rowB: KeyScope = { target: "row-b", action: "save" };
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    await act(async () => result.current.run(measureOn(server, 1), "a", rowA));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(measureOn(server, 2), "b", rowB));
    expect(server.keys[1]).not.toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    await act(async () => result.current.run(measureOn(server, 1), "a", rowA));
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    expect(server.records.size).toBe(2);
  });

  it("US-QS-03 an edited retry after a lost answer keeps the key: the server refuses it (idempotency.key_conflict), one record, the original replays", async () => {
    online(true);
    const server = serverLosing(1, true);
    const { result } = renderHook(() =>
      useWriteAction(
        async () => "token",
        () => undefined,
      ),
    );
    // The action names the operation only (a create or an append): the edited value is the body, not the action.
    const scope: KeyScope = appendKey("specimen", "e1", "measure");
    await act(async () => result.current.run(measureOn(server, 9), "a", scope));
    expect(result.current.error?.code).toBe("network.not_reachable");
    await act(async () => result.current.run(measureOn(server, 10), "b", scope));
    expect(server.keys[1]).toBe(server.keys[0]);
    expect(result.current.error?.code).toBe("idempotency.key_conflict");
    expect(server.records.size).toBe(1);
    // The original body under the held key gets the stored answer: success, still one record.
    await act(async () => result.current.run(measureOn(server, 9), "a", scope));
    expect(server.keys[2]).toBe(server.keys[0]);
    expect(result.current.error).toBeNull();
    expect(server.records.size).toBe(1);
  });

  it("US-QS-03 the server refuses a key that comes back with another body: idempotency.key_conflict is the answer, nothing is replayed", async () => {
    const server = serverLosing(0, true);
    await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "same" })(
      "POST",
      "/measurements",
      { value: 1 },
    );
    const again = await createWrite("http://api", "tok", { fetchFn: server.fetchFn, key: "same" })(
      "POST",
      "/measurements",
      { value: 2 },
    );
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error.code).toBe("idempotency.key_conflict");
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
    await act(async () => result.current.run(save, "Gesichert.", page));
    await act(async () => result.current.run(save, "Gesichert.", page));
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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

describe("US-QS-03 · an offline tap is buffered before the token is asked", () => {
  it("US-QS-03 an offline tap with an expired token is buffered and delivered once, with its key, when the token is back", async () => {
    online(false);
    const server = serverLosing(0, true);
    vi.stubGlobal("fetch", server.fetchFn);
    // The token of the tab is gone (expired): it is read again only when the buffer delivers (outbox.ts).
    const tokenOf: { current?: string } = {};
    function ExpiredPage(props: { send: WriteSend }) {
      const write = useWriteAction(
        async () => tokenOf.current,
        () => undefined,
      );
      return (
        <button type="button" onClick={() => void write.run(props.send, "Gesichert.", page)}>
          Sichern
        </button>
      );
    }
    render(
      <AnnouncerProvider>
        <ExpiredPage send={measureOn(server, 9)} />
      </AnnouncerProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    expect(server.keys).toHaveLength(0);
    tokenOf.current = "token";
    online(true);
    await deliverBuffered();
    expect(server.keys).toHaveLength(1);
    expect(server.records.size).toBe(1);
    await waitFor(() => expect(heard()).toMatch(/^Nachträglich gesendet/));
  });
});

describe("US-QS-30 · a write through useWriteAction stays active offline", () => {
  it("US-QS-30 · offline the buffered write control is active, buffers the write and is not refused", async () => {
    online(false);
    const fetchFn = serverWith();
    shell(measure(9));
    const button = screen.getByRole("button", { name: "Sichern" });
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    await userEvent.click(button);
    expect(fetchFn).not.toHaveBeenCalled();
    await buffered();
    expect(screen.queryByText(/Keine Verbindung/)).toBeNull();
  });
});

/** Two writes of two actions on one page, so both can wait in the buffer at once (US-QS-10). */
function TwoWrites(props: { send: WriteSend }) {
  const first = useWriteAction(sessionToken, () => undefined);
  const second = useWriteAction(sessionToken, () => undefined);
  return (
    <>
      <button
        type="button"
        onClick={() => void first.run(props.send, "Gesichert: Monstera.", rowOf("row-a"))}
      >
        Erste
      </button>
      <button
        type="button"
        onClick={() => void second.run(props.send, "Gesichert: Aloe.", rowOf("row-b"))}
      >
        Zweite
      </button>
    </>
  );
}
const rowOf = (target: string): KeyScope => ({ target, action: "save" });

const ACCOUNT_CHANGED =
  "Die Änderung gehört zu einem Konto, das nicht mehr angemeldet ist. Melde dich mit diesem Konto an und wiederhole sie.";
const refusedNote = `Nicht gesendet: ${ACCOUNT_CHANGED}`;

describe("US-QS-07 · a buffered write is sent only under the account it was made under (P-04)", () => {
  it("US-QS-07 buffered under account A, the device is signed in as B before delivery: nothing is sent, no token is read, the refusal is visible and announced, the write is dropped", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    const after = vi.fn();
    const tokenOf = vi.fn(sessionToken);
    shell(measure(9), after, tokenOf);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    signInAs("B");
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toBe(refusedNote));
    expect(visible(refusedNote)).toHaveLength(1);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(tokenOf).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    await deliverBuffered();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-QS-07 buffered under account A, no account is signed in at delivery: nothing is sent and the refusal is visible and announced", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    shell(measure(9), vi.fn(), sessionToken);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    signInAs(null);
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toBe(refusedNote));
    expect(visible(refusedNote)).toHaveLength(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-QS-07 buffered under account A, the device is still signed in as A: delivered once, with the token of A", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    shell(measure(9), vi.fn(), sessionToken);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toBe("Nachträglich gesendet: Gesichert: Monstera."));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-of-A");
  });

  it("US-QS-07 two writes refused for the same reason: the text is said once in the note", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    render(
      <AnnouncerProvider>
        <TwoWrites send={measure(9)} />
      </AnnouncerProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Erste" }));
    await userEvent.click(screen.getByRole("button", { name: "Zweite" }));
    await buffered();
    signInAs("B");
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toBe(refusedNote));
    expect(visible(refusedNote)).toHaveLength(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-QS-07 two kept users of different accounts on the device count as no account: a buffered write is refused, not sent", async () => {
    online(false);
    const fetchFn = serverWith(ok());
    window.localStorage.setItem(
      "oidc.user:https://other.example/realms/x:pflanzendex-web",
      JSON.stringify({ access_token: "token-of-B", profile: { sub: "B" } }),
    );
    shell(measure(9), vi.fn(), sessionToken);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await buffered();
    online(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(heard()).toBe(refusedNote));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

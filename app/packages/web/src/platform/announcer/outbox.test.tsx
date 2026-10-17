// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWriteAction } from "@/kernel";
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
function Page(props: { send: () => Promise<{ ok: true; value: unknown }>; after: () => void }) {
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

const shell = (send: () => Promise<{ ok: true; value: unknown }>, after = vi.fn()) =>
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

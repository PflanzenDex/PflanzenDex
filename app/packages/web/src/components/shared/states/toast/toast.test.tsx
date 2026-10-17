// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastDuration } from "./toast-item/toast-item";
import { ToastProvider, useToast, type ToastOptions } from "./toast-provider/toast-provider";

let api: ReturnType<typeof useToast>;
function Capture() {
  api = useToast();
  return null;
}
function setup() {
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}
const region = (name: "polite" | "assertive") =>
  document.querySelector(`[aria-live="${name}"]`) as HTMLElement;
const show = (options: ToastOptions) => act(() => void api.show(options));
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast (US-QS-07, P-10)", () => {
  it("US-QS-07 · both live regions exist before the first toast, polite for confirmations", () => {
    setup();
    expect(region("polite")).toBeTruthy();
    expect(region("assertive")).toBeTruthy();
    show({ message: "Gegossen." });
    expect(within(region("polite")).getByText("Gegossen.")).toBeTruthy();
    expect(region("assertive").textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-07 · an error goes into the assertive region", () => {
    setup();
    show({ kind: "error", message: "Speichern fehlgeschlagen." });
    expect(within(region("assertive")).getByText("Speichern fehlgeschlagen.")).toBeTruthy();
  });

  it("US-QS-07 · useToast outside a provider fails loudly (P-10)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Capture />)).toThrow("ToastProvider");
  });

  it("US-QS-07 · a confirmation closes by itself after its reading time", () => {
    setup();
    show({ message: "Gegossen." });
    const ms = toastDuration({ kind: "success", message: "Gegossen." });
    wait(ms - 1);
    expect(screen.queryByText("Gegossen.")).not.toBeNull();
    wait(1);
    expect(screen.queryByText("Gegossen.")).toBeNull();
  });

  it("US-QS-07 · P-10 an error stays longer than a confirmation, an undo action longer than a plain one", () => {
    const message = "Gleicher Text";
    const plain = toastDuration({ kind: "success", message });
    expect(
      toastDuration({ kind: "success", message, action: { label: "x", onAction: vi.fn() } }),
    ).toBeGreaterThan(plain);
    expect(toastDuration({ kind: "error", message })).toBeGreaterThanOrEqual(10_000);
    expect(toastDuration({ kind: "error", message })).toBeGreaterThan(plain);
  });

  it("US-QS-07 · longer text gets more reading time", () => {
    expect(toastDuration({ kind: "success", message: "x".repeat(200) })).toBeGreaterThan(
      toastDuration({ kind: "success", message: "x" }),
    );
  });

  it("US-QS-07 · hovering pauses the countdown and leaving resumes with the rest", () => {
    setup();
    show({ message: "Gegossen.", duration: 1000 });
    const toast = screen.getByText("Gegossen.").parentElement as HTMLElement;
    wait(600);
    fireEvent.pointerEnter(toast);
    wait(60_000);
    expect(screen.queryByText("Gegossen.")).not.toBeNull();
    fireEvent.pointerLeave(toast);
    wait(399);
    expect(screen.queryByText("Gegossen.")).not.toBeNull();
    wait(1);
    expect(screen.queryByText("Gegossen.")).toBeNull();
  });

  it("US-QS-07 · focus inside pauses the countdown, and the undo button stays reachable", () => {
    setup();
    const onAction = vi.fn();
    show({ message: "Gelöscht.", action: { label: "Rückgängig", onAction }, duration: 1000 });
    const undo = screen.getByRole("button", { name: "Rückgängig" });
    act(() => undo.focus());
    wait(60_000);
    expect(screen.queryByText("Gelöscht.")).not.toBeNull();
    // moving the focus between the toast's own buttons keeps it paused
    act(() => screen.getByRole("button", { name: "Meldung schließen" }).focus());
    wait(60_000);
    expect(screen.queryByText("Gelöscht.")).not.toBeNull();
    act(() => (document.activeElement as HTMLElement).blur());
    wait(1000);
    expect(screen.queryByText("Gelöscht.")).toBeNull();
  });

  it("US-QS-07 · the undo action runs once and closes the toast", () => {
    setup();
    const onAction = vi.fn();
    show({ message: "Gelöscht.", action: { label: "Rückgängig", onAction } });
    fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Gelöscht.")).toBeNull();
  });

  it("US-QS-07 · the close button and Escape from the keyboard close it", () => {
    setup();
    show({ message: "Eins." });
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(screen.queryByText("Eins.")).toBeNull();
    show({ message: "Zwei." });
    fireEvent.keyDown(screen.getByRole("button", { name: "Meldung schließen" }), { key: "Escape" });
    expect(screen.queryByText("Zwei.")).toBeNull();
  });

  it("US-QS-07 · dismiss by id removes only that toast", () => {
    setup();
    let id = 0;
    act(() => {
      id = api.show({ message: "A." });
      api.show({ message: "B." });
    });
    act(() => api.dismiss(id));
    expect(screen.queryByText("A.")).toBeNull();
    expect(screen.queryByText("B.")).not.toBeNull();
  });

  it("US-QS-07 · P-10 at most three show at once, the rest wait in line and none is lost", () => {
    setup();
    for (const n of [1, 2, 3, 4]) show({ message: `Meldung ${n}`, duration: 1000 });
    expect(screen.queryByText("Meldung 4")).toBeNull();
    wait(1000);
    expect(screen.queryByText("Meldung 4")).not.toBeNull();
  });

  it("US-QS-07 · under reduced motion the entry animation is off", () => {
    setup();
    show({ message: "Gegossen." });
    const cls = (screen.getByText("Gegossen.").parentElement as HTMLElement).className;
    expect(cls).toContain("animate-toast-in");
    expect(cls).toContain("motion-reduce:animate-none");
  });

  it("US-QS-07 · the viewport sits above the bottom bar on a phone and the close button is 44 px", () => {
    setup();
    show({ message: "Gegossen." });
    const viewport = region("polite").parentElement as HTMLElement;
    expect(viewport.className).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)]");
    expect(screen.getByRole("button", { name: "Meldung schließen" }).className).toContain(
      "min-h-[44px]",
    );
  });
});

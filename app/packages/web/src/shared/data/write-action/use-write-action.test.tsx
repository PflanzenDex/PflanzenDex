// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ToastProvider,
  useSay,
} from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { appendKey, forgetRepeatKeys } from "../index";
import { useWriteAction } from "./use-write-action";

// The error-text module cannot load (its chunk request fails, US-QS-15): its import rejects.
vi.mock("@/shared/lib/error-text", () => {
  throw new Error("error texts cannot load");
});

afterEach(() => {
  cleanup();
  forgetRepeatKeys();
});

function Probe() {
  const write = useWriteAction(
    async () => "tok",
    () => undefined,
    useSay(),
  );
  return (
    <button
      type="button"
      onClick={() =>
        void write.run(
          async () => ({ ok: false, error: { code: "server.unexpected", text: "raw" } }),
          "Gesichert.",
          { target: "probe", action: "save" },
        )
      }
    >
      Schreiben
    </button>
  );
}

describe("US-QS-15 a refusal of a write", () => {
  it("US-QS-15 · a refusal still shows a toast when the error texts cannot load (issue 1644)", async () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Schreiben" }));
    // The assertive region carries the errors (P-10): the generic German text, never the raw server text.
    const assertive = () => document.querySelector('[aria-live="assertive"]')?.textContent ?? "";
    await vi.waitFor(() =>
      expect(assertive()).toContain("Das hat nicht geklappt. Bitte versuche es noch einmal."),
    );
    expect(assertive()).not.toContain("raw");
  });
});

describe("US-QS-03 · the key conflict of a write that says its result as a toast", () => {
  it("US-QS-03 · P-10 the toast of a key conflict frees the held key when it is closed: the next tap sends a fresh key", async () => {
    const keys: string[] = [];
    const conflict = async (_token: string, options: { key: string }) => {
      keys.push(options.key);
      return { ok: false as const, error: { code: "idempotency.key_conflict", text: "x" } };
    };
    function Page() {
      const write = useWriteAction(
        async () => "tok",
        () => undefined,
        useSay(),
      );
      return (
        <button
          type="button"
          onClick={() =>
            void write.run(conflict, "Gesichert.", appendKey("specimen", "t1", "note"))
          }
        >
          Schreiben
        </button>
      );
    }
    render(
      <ToastProvider>
        <Page />
      </ToastProvider>,
    );
    const assertive = () => document.querySelector('[aria-live="assertive"]')?.textContent ?? "";
    await userEvent.click(screen.getByRole("button", { name: "Schreiben" }));
    await vi.waitFor(() => expect(assertive()).toContain("Das hat nicht geklappt."));
    // The key is held while the toast stands: the same key is sent again.
    await userEvent.click(screen.getByRole("button", { name: "Schreiben" }));
    expect(keys[1]).toBe(keys[0]);
    // Two toasts of the same conflict stand: the key is freed when the last of them is gone.
    await userEvent.click(
      screen.getAllByRole("button", { name: "Meldung schließen" })[0] as HTMLElement,
    );
    await userEvent.click(screen.getByRole("button", { name: "Schreiben" }));
    expect(keys[2]).toBe(keys[0]);
    for (const close of screen.getAllByRole("button", { name: "Meldung schließen" }))
      await userEvent.click(close);
    await userEvent.click(screen.getByRole("button", { name: "Schreiben" }));
    expect(keys[3]).not.toBe(keys[0]);
  });
});

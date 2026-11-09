// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ToastProvider,
  useSay,
} from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { useWriteAction } from "./use-write-action";

// The error-text module cannot load (its chunk request fails, US-QS-15): its import rejects.
vi.mock("@/shared/lib/error-text", () => {
  throw new Error("error texts cannot load");
});

afterEach(() => {
  cleanup();
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
          "Gespeichert.",
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

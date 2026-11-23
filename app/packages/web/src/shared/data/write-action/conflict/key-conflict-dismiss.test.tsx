// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountKey,
  appendKey,
  createKey,
  entityKey,
  forgetRepeatKeys,
  runRepeat,
  type KeyScope,
} from "../repeat-key";
import { withConflictDismiss } from "./key-conflict-dismiss";
import type { ApiError, Response } from "../../api";

afterEach(() => {
  forgetRepeatKeys();
  document.body.replaceChildren();
});

const conflict: ApiError = { code: "idempotency.key_conflict", text: "Konflikt." };
const refused = (error: ApiError): Response<unknown> => ({ ok: false, error });

/** Sends one write of `scope` that the server answers with `error`; returns the key it was sent under. */
async function sendRefused(scope: KeyScope, error: ApiError): Promise<string> {
  let sentKey = "";
  await runRepeat(scope, async (key) => {
    sentKey = key;
    return refused(error);
  });
  return sentKey;
}

describe("US-QS-03 · P-10 the dismiss of a key conflict of a write that uses the repeat guard directly", () => {
  it("US-QS-03 a key conflict of a create gets a dismiss that frees the held key and clears the refusal", async () => {
    const scope = createKey("treatment", "plan");
    const first = await sendRefused(scope, conflict);
    // The conflict of a create keeps its key: the next tap repeats it (no second record).
    expect(await sendRefused(scope, conflict)).toBe(first);
    const clear = vi.fn();
    const shown = withConflictDismiss(conflict, scope, clear);
    expect(shown.code).toBe(conflict.code);
    expect(shown.dismiss).toBeTypeOf("function");
    shown.dismiss?.();
    expect(clear).toHaveBeenCalledTimes(1);
    // Dismissed: the next tap is a fresh write under a key of its own.
    expect(await sendRefused(scope, conflict)).not.toBe(first);
  });

  it("US-QS-03 a key conflict of an append gets the dismiss too", async () => {
    const scope = appendKey("specimen", "s1", "leaf:record");
    const first = await sendRefused(scope, conflict);
    const shown = withConflictDismiss(conflict, scope, vi.fn());
    shown.dismiss?.();
    expect(await sendRefused(scope, conflict)).not.toBe(first);
  });

  it("US-QS-03 a key conflict of a set-state gets no dismiss: its key is freed already", async () => {
    for (const scope of [entityKey("specimen", "s1", "notes"), accountKey("profile")]) {
      await sendRefused(scope, conflict);
      expect(withConflictDismiss(conflict, scope, vi.fn())).toBe(conflict);
    }
  });

  it("US-QS-03 every other refusal keeps its error as it is, no dismiss", () => {
    const scope = createKey("species", "propose");
    for (const code of ["input.invalid", "idempotency.in_progress", "network.not_reachable"]) {
      const error: ApiError = { code, text: "x" };
      expect(withConflictDismiss(error, scope, vi.fn())).toBe(error);
    }
  });

  it("US-QS-03 · 2.4.3 the dismiss returns the focus to the control that was focused when the refusal came", () => {
    const scope = createKey("invite", "codes");
    document.body.innerHTML =
      '<button id="start">Sichern</button><button id="other">Anderes</button>';
    const start = document.getElementById("start") as HTMLElement;
    start.focus();
    const shown = withConflictDismiss(conflict, scope, vi.fn());
    document.getElementById("other")?.focus();
    shown.dismiss?.();
    expect(document.activeElement).toBe(start);
  });

  it("US-QS-03 a starter that left the page is skipped, the dismiss still frees the key and clears", () => {
    const scope = createKey("invite", "codes");
    document.body.innerHTML = '<button id="start">Sichern</button>';
    (document.getElementById("start") as HTMLElement).focus();
    const clear = vi.fn();
    const shown = withConflictDismiss(conflict, scope, clear);
    document.body.replaceChildren();
    expect(() => shown.dismiss?.()).not.toThrow();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import {
  GatedRouter,
  hold,
  releaseHold,
  resetHold,
} from "@/shared/patterns/responsive/layer-sheet/layer-sheet.test-helpers";
import { GUARD, stateFlag } from "./form-address";
import { useFormAddress } from "./use-form-address";

afterEach(() => {
  cleanup();
  resetHold();
});

/** The kind of the form each render showed, in order: a settle must keep the form on screen (issue 2165). */
let kinds: (string | null)[] = [];

/** The form hook with the committed location and the navigator of the router (issue 2165). */
function useHarness() {
  const form = useFormAddress(true);
  const location = useLocation();
  const navigate = useNavigate();
  kinds.push(form.kind);
  return { form, location, navigate };
}

function Gated({ children }: { children: ReactNode }) {
  return <GatedRouter entry="/collection?view=plants">{children}</GatedRouter>;
}

describe("US-QS-15 a settle leaves no guard entry ahead of the form (issue 2165)", () => {
  it("US-QS-15 a settle whose guard entry is still pending keeps the form and leaves no guard entry ahead: Forward reaches the form, a second Forward does nothing (issue 2165)", async () => {
    const { result } = renderHook(useHarness, { wrapper: Gated });
    act(() => result.current.form.open("measure", "e1"));
    expect(result.current.form.kind).toBe("measure");
    // The first input pushes the guard entry, and the router holds it back: the settle runs while it is still pending.
    hold.on = true;
    act(() => result.current.form.typed());
    expect(hold.queued).not.toBeNull();
    kinds = [];
    act(() => result.current.form.settle());
    await releaseHold();
    // The form stayed on screen through the steps back and the push of its entry again.
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((kind) => kind === "measure")).toBe(true);
    expect(result.current.form.kind).toBe("measure");
    expect(result.current.location.search).toContain("form=measure");
    expect(stateFlag(result.current.location.state, GUARD)).toBe(false);
    // Back from the form is one step to the list.
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).not.toContain("form=measure");
    // Forward reaches the form on its own entry, not a guard entry.
    act(() => result.current.navigate(1));
    expect(result.current.location.search).toContain("form=measure");
    expect(stateFlag(result.current.location.state, GUARD)).toBe(false);
    // Nothing is ahead of the form: a second Forward does nothing.
    const key = result.current.location.key;
    act(() => result.current.navigate(1));
    expect(result.current.location.key).toBe(key);
    expect(stateFlag(result.current.location.state, GUARD)).toBe(false);
  });
});

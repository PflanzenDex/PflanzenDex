// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkerRule } from "../../../../../../collection";
import { SaveButton } from "./save-button";

afterEach(cleanup);

const RULE: MarkerRule = { required: false, missing: [], preset: "" };

/** The part of the first-plant flow the button reads: the zones, the rule, the save and whether it runs (US-QS-03). */
function flow(over: {
  saving?: boolean;
  zones?: null | [];
  zonesError?: string | null;
  rule?: null;
}) {
  const save = vi.fn(() => Promise.resolve());
  return {
    save,
    saving: over.saving ?? false,
    zones: over.zones === undefined ? [] : over.zones,
    zonesError: over.zonesError ?? null,
    marker: { rule: over.rule === undefined ? RULE : over.rule },
  };
}
type Flow = Parameters<typeof SaveButton>[0]["f"];
const show = (f: ReturnType<typeof flow>) =>
  render(<SaveButton f={f as unknown as Flow}>Pflanze sichern</SaveButton>);
const button = () => screen.getByRole("button", { name: "Pflanze sichern" });

describe("US-QS-03 · the save button shows what it waits for and drops a press while it waits (P-10, PF-045)", () => {
  it("US-QS-03 with the zones and the rule read it is usable, and a press saves", async () => {
    const f = flow({});
    show(f);
    expect(button().getAttribute("aria-disabled")).toBeNull();
    expect(button().getAttribute("aria-busy")).toBeNull();
    await userEvent.click(button());
    expect(f.save).toHaveBeenCalledTimes(1);
  });

  it("US-QS-03 while the rule is read it is aria-disabled and busy with a spinner, never natively disabled, and a press saves nothing", async () => {
    const f = flow({ rule: null });
    show(f);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(button().getAttribute("aria-busy")).toBe("true");
    expect((button() as HTMLButtonElement).disabled).toBe(false);
    expect(button().querySelector(".animate-spin")).not.toBeNull();
    await userEvent.click(button());
    expect(f.save).not.toHaveBeenCalled();
  });

  it("US-QS-03 while the zones are read, or the save runs, it is busy as well", () => {
    show(flow({ zones: null }));
    expect(button().getAttribute("aria-busy")).toBe("true");
    cleanup();
    show(flow({ saving: true }));
    expect(button().getAttribute("aria-busy")).toBe("true");
  });

  it("US-QS-03 zones that failed make it inert but not busy: the zone block shows the reason with its retry", async () => {
    const f = flow({ zones: null, zonesError: "Keine Verbindung." });
    show(f);
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(button().getAttribute("aria-busy")).toBeNull();
    expect(button().querySelector(".animate-spin")).toBeNull();
    await userEvent.click(button());
    expect(f.save).not.toHaveBeenCalled();
  });
});

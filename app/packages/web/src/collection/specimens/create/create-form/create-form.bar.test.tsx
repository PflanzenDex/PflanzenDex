// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { CreateForm } from "./create-form";

// US-QS-32 (owner decisions d-056 and d-060, SG-SHEET-04): the form "Pflanze anlegen" has its actions in the bar like every
// other form: "Abbrechen" at the leading edge, "Pflanze anlegen" at the trailing edge. Below md the bar sticks at the top
// of the form; from md the pair is a plain row after the last field.
const species = { id: "a1", latinName: "Dracaena trifasciata", germanName: "Bogenhanf" } as Species;

afterEach(cleanup);

function show(props: { onCancel?: () => void; onSend?: () => Promise<null> } = {}) {
  const onCancel = props.onCancel ?? vi.fn();
  const onSend = props.onSend ?? vi.fn(async () => null);
  render(
    <CreateForm
      species={species}
      siblings={[]}
      locations={[]}
      zones={{ items: [], failed: false }}
      onSend={onSend}
      onCancel={onCancel}
    />,
  );
  return { onCancel, onSend };
}

const follows = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The first and the last control of the form's fields. */
function fields() {
  const all = Array.from(
    screen
      .getByRole("form", { name: "Pflanze anlegen" })
      .querySelectorAll("input, select, textarea"),
  );
  return { first: all[0] as Element, last: all[all.length - 1] as Element };
}

describe("US-QS-32 · SG-SHEET-04 the create form shows Abbrechen in its bar", () => {
  it("US-QS-32 the cancel reads Abbrechen, not Zurück zur Art, and it leaves the way it did before: back to the species choice, nothing sent", async () => {
    setViewportWidth(360);
    const { onCancel, onSend } = show();
    expect(screen.queryByRole("button", { name: "Zurück zur Art" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("US-QS-32 Abbrechen leads and Pflanze anlegen trails in the bar, and the action still sends the form", async () => {
    setViewportWidth(360);
    const { onSend } = show();
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => b.closest("[data-form-bar]") !== null)
      .map((b) => b.textContent);
    expect(buttons).toEqual(["Abbrechen", "Pflanze anlegen"]);
    await userEvent.click(screen.getByRole("button", { name: "Pflanze anlegen" }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("US-QS-32 below md the bar sticks at the top of the form, before the first field", () => {
    setViewportWidth(360);
    show();
    const bar = screen.getByRole("button", { name: "Pflanze anlegen" })
      .parentElement as HTMLElement;
    expect(bar.className.split(/\s+/)).toContain("sticky");
    expect(follows(bar, fields().first)).toBe(true);
  });

  it("US-QS-32 · d-060 from md the pair is a plain row after the last field, not sticky, and only one pair is in the page", async () => {
    setViewportWidth(1024);
    const { onCancel } = show();
    const save = screen.getByRole("button", { name: "Pflanze anlegen" });
    const bar = save.parentElement as HTMLElement;
    expect(bar.className).not.toMatch(/\b(sticky|fixed)\b/);
    expect(follows(fields().last, bar)).toBe(true);
    expect(screen.getAllByRole("button", { name: "Abbrechen" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Pflanze anlegen" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledOnce();
    act(() => setViewportWidth(360));
    expect(screen.getAllByRole("button", { name: "Pflanze anlegen" })).toHaveLength(1);
  });
});

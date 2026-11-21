// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { FormBar } from "@/shared/ui/button/form-bar/form-bar";
import { ResponsiveModal } from "./responsive-modal";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

/** A form that draws its bar through the container, as the forms of the layers do: the bar after the last field (US-QS-32, SG-SHEET-04). */
function BarForm(props: { onSubmit?: () => void; pending?: boolean }) {
  return (
    <form
      id="bar-form"
      aria-label="Notiz"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit?.();
      }}
    >
      <label>
        Text
        <input />
      </label>
      <FormBar formId="bar-form" pending={props.pending ?? false}>
        Sichern
      </FormBar>
    </form>
  );
}

function Example(props: { bar?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ResponsiveModal
      title="Notiz"
      open={open}
      onOpenChange={(next) => {
        props.onOpenChange?.(next);
        setOpen(next);
      }}
    >
      {props.bar === false ? <input aria-label="Text" /> : <BarForm />}
    </ResponsiveModal>
  );
}

const position = (a: Element, b: Element) => a.compareDocumentPosition(b);

describe("US-QS-32 · SG-SHEET-04 a phone sheet puts the actions of its form in the bar", () => {
  it("US-QS-32 · SG-SHEET-04 with bar actions Abbrechen precedes the confirming action inside the sheet's bar, and both sit above the scroll region and the title", async () => {
    setViewportWidth(360);
    render(<Example />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    const cancel = await within(sheet).findByRole("button", { name: "Abbrechen" });
    const save = within(sheet).getByRole("button", { name: "Sichern" });
    expect(position(cancel, save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const bar = cancel.parentElement as HTMLElement;
    expect(bar.contains(save)).toBe(true);
    expect(bar.hasAttribute("data-form-bar")).toBe(true);
    // The scroll region holds the form's fields; the bar is not inside it.
    const field = within(sheet).getByLabelText("Text");
    const scroll = field.closest(".overflow-y-auto") as HTMLElement;
    expect(scroll).not.toBeNull();
    expect(scroll.contains(bar)).toBe(false);
    expect(position(bar, scroll) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    // Row 1 is the bar, row 2 the title (it still names the sheet).
    const title = within(sheet).getByRole("heading", { name: "Notiz" });
    expect(position(bar, title) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("US-QS-32 · SG-SHEET-04 with bar actions the close X is gone: Abbrechen is the one close control", async () => {
    setViewportWidth(360);
    render(<Example />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    expect(within(sheet).queryByRole("button", { name: "Schließen" })).toBeNull();
  });

  it("US-QS-32 · SG-SHEET-02 without bar actions the X stays exactly as it is, and no bar is drawn", async () => {
    setViewportWidth(360);
    render(<Example bar={false} />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    const close = within(sheet).getByRole("button", { name: "Schließen" });
    expect(close.hasAttribute("data-close")).toBe(true);
    expect(within(sheet).queryByRole("button", { name: "Abbrechen" })).toBeNull();
    expect(sheet.querySelector("[data-form-bar]")).toBeNull();
  });

  it("US-QS-32 · SG-SHEET-04 Abbrechen closes the sheet through the container, as the X and a tap on the scrim do", async () => {
    setViewportWidth(360);
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Abbrechen" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Notiz" })).toBeNull());
  });

  it("US-QS-32 · SG-SHEET-04 the confirming action submits the form that stays in the scroll region", async () => {
    setViewportWidth(360);
    const onSubmit = vi.fn();
    render(
      <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
        <BarForm onSubmit={onSubmit} />
      </ResponsiveModal>,
    );
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.click(await within(sheet).findByRole("button", { name: "Sichern" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-SHEET-07 on open the focus lands in the form, never on a button of the bar", async () => {
    setViewportWidth(360);
    render(<Example />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    await waitFor(() => expect(document.activeElement).toBe(within(sheet).getByLabelText("Text")));
  });

  it("US-QS-32 · SG-SHEET-04 the bar leaves with the form: a sheet whose form is replaced by plain content shows its X again", async () => {
    setViewportWidth(360);
    function Swap() {
      const [form, setForm] = useState(true);
      return (
        <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
          {form ? <BarForm /> : <p>Nur Text</p>}
          <button type="button" onClick={() => setForm(false)}>
            Formular weg
          </button>
        </ResponsiveModal>
      );
    }
    render(<Swap />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Formular weg" }));
    await waitFor(() =>
      expect(within(sheet).getByRole("button", { name: "Schließen" })).toBeTruthy(),
    );
    expect(within(sheet).queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });
});

describe("US-QS-32 · SG-SHEET-04 from md the same pair is a plain row after the last field of the dialog, nothing sticky", () => {
  it("US-QS-32 · SG-SHEET-04 in a dialog Abbrechen precedes the confirming action in a row that is not sticky", async () => {
    setViewportWidth(800);
    render(<Example />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    const cancel = await within(dialog).findByRole("button", { name: "Abbrechen" });
    const save = within(dialog).getByRole("button", { name: "Sichern" });
    expect(position(cancel, save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const bar = cancel.parentElement as HTMLElement;
    expect(bar.className).not.toMatch(/\b(sticky|fixed)\b/);
  });

  it("US-QS-32 · SG-SHEET-04 in a dialog from 768 px the pair stands after the last field, in the content, and focus order follows the picture", async () => {
    setViewportWidth(768);
    render(<Example />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    const cancel = await within(dialog).findByRole("button", { name: "Abbrechen" });
    const field = within(dialog).getByLabelText("Text");
    expect(position(field, cancel) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(within(dialog).getAllByRole("button", { name: "Abbrechen" })).toHaveLength(1);
    expect(within(dialog).getAllByRole("button", { name: "Sichern" })).toHaveLength(1);
    // The pair is in the content of the dialog, below the title, and Abbrechen is read before the confirming action.
    const title = within(dialog).getByRole("heading", { name: "Notiz" });
    expect(position(title, cancel) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const save = within(dialog).getByRole("button", { name: "Sichern" });
    expect(position(cancel, save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("US-QS-32 · SG-SHEET-04 Abbrechen of the dialog closes it", async () => {
    setViewportWidth(800);
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Abbrechen" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("US-QS-32 · SG-SHEET-04 the pair keeps working when the window crosses md: one pair at a time, the form keeps its input", async () => {
    setViewportWidth(360);
    render(<Example />);
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    await userEvent.type(within(sheet).getByLabelText("Text"), "Basilikum");
    act(() => setViewportWidth(1024));
    await screen.findByRole("dialog", { name: "Notiz" });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Abbrechen" })).toHaveLength(1),
    );
    expect(screen.getAllByRole("button", { name: "Sichern" })).toHaveLength(1);
    expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe("Basilikum");
  });
});

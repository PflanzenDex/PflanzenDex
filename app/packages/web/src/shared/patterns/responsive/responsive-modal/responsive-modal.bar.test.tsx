// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { FormBar } from "@/shared/ui/form-bar";
import { ResponsiveModal } from "./responsive-modal";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(cleanup);

/** A form that draws its bar through the container, as the forms of the layers do: the bar after the last field (US-QS-32, SG-SHEET-04). */
function BarForm(props: { onSubmit?: () => void; pending?: boolean; status?: string | null }) {
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
      <FormBar
        formId="bar-form"
        pending={props.pending ?? false}
        {...(props.status !== undefined ? { status: props.status } : {})}
      >
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

  it("US-QS-32 · SG-SHEET-04 the status line of the action stands inside the sheet's bar, right under the pair, and is the only status in the sheet", async () => {
    setViewportWidth(360);
    render(
      <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
        <BarForm status="Foto wird gespeichert …" />
      </ResponsiveModal>,
    );
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    const save = await within(sheet).findByRole("button", { name: "Sichern" });
    const row = save.parentElement as HTMLElement;
    const status = within(sheet).getByRole("status");
    expect(status.textContent).toBe("Foto wird gespeichert …");
    expect(within(sheet).getAllByRole("status")).toHaveLength(1);
    // The row of the pair and the status share the bar slot of the sheet (above the title), the status right after the row.
    expect(row.hasAttribute("data-form-bar")).toBe(true);
    expect(row.parentElement?.hasAttribute("data-sheet-bar")).toBe(true);
    expect(row.nextElementSibling).toBe(status);
    // It is not in the scroll region with the fields.
    const field = within(sheet).getByLabelText("Text");
    expect((field.closest(".overflow-y-auto") as HTMLElement).contains(status)).toBe(false);
  });

  it("US-QS-32 · SG-SHEET-04 an empty status line in the sheet's bar is there for a status that appears and takes no room", async () => {
    setViewportWidth(360);
    render(
      <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
        <BarForm status={null} />
      </ResponsiveModal>,
    );
    const sheet = await screen.findByRole("dialog", { name: "Notiz" });
    await within(sheet).findByRole("button", { name: "Sichern" });
    const status = within(sheet).getByRole("status");
    expect(status.textContent).toBe("");
    expect(status.className.split(/\s+/)).toContain("empty:hidden");
    expect(status.parentElement?.hasAttribute("data-sheet-bar")).toBe(true);
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

describe("US-QS-32 · SG-SHEET-04 · d-115 from md the same pair is pinned at the bottom of the dialog, under its scroll region", () => {
  it("US-QS-32 · d-115 in a dialog Abbrechen precedes the confirming action in a pinned bar that is no part of the scroll region", async () => {
    setViewportWidth(800);
    render(<Example />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    const cancel = await within(dialog).findByRole("button", { name: "Abbrechen" });
    const save = within(dialog).getByRole("button", { name: "Sichern" });
    expect(position(cancel, save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const row = cancel.parentElement as HTMLElement;
    expect(row.hasAttribute("data-form-bar")).toBe(true);
    // The bar is the dialog's own, below the scroll region that holds the fields: it never scrolls away with them.
    const bar = row.parentElement as HTMLElement;
    expect(bar.hasAttribute("data-layer-bar")).toBe(true);
    const scroll = within(dialog)
      .getByLabelText("Text")
      .closest("[data-scroll-region]") as HTMLElement;
    expect(scroll).not.toBeNull();
    expect(scroll.contains(bar)).toBe(false);
    expect(position(scroll, bar) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(bar.parentElement).toBe(scroll.parentElement);
  });

  it("US-QS-32 · d-115 in a dialog from 768 px the pair stands after the title and the fields in the DOM, so the focus order follows the picture", async () => {
    setViewportWidth(768);
    render(<Example />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    const cancel = await within(dialog).findByRole("button", { name: "Abbrechen" });
    const field = within(dialog).getByLabelText("Text");
    expect(position(field, cancel) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(within(dialog).getAllByRole("button", { name: "Abbrechen" })).toHaveLength(1);
    expect(within(dialog).getAllByRole("button", { name: "Sichern" })).toHaveLength(1);
    const title = within(dialog).getByRole("heading", { name: "Notiz" });
    expect(position(title, cancel) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("US-QS-32 · d-115 the status line of the action stands right under the pair in the pinned bar of the dialog", async () => {
    setViewportWidth(800);
    render(
      <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
        <BarForm status="Foto wird gespeichert …" />
      </ResponsiveModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    const save = await within(dialog).findByRole("button", { name: "Sichern" });
    const row = save.parentElement as HTMLElement;
    const status = within(dialog).getByRole("status");
    expect(row.nextElementSibling).toBe(status);
    expect(row.parentElement?.hasAttribute("data-layer-bar")).toBe(true);
    expect(within(dialog).getAllByRole("status")).toHaveLength(1);
  });

  it("US-QS-32 · d-115 a dialog without a form draws no bar and takes no room for one", async () => {
    setViewportWidth(800);
    render(<Example bar={false} />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    expect(dialog.querySelector("[data-form-bar]")).toBeNull();
    const slot = dialog.querySelector("[data-layer-bar]");
    expect(slot === null || slot.childElementCount === 0).toBe(true);
    if (slot) expect(slot.className.split(/\s+/)).toContain("empty:hidden");
  });

  it("US-QS-32 · SG-SHEET-04 Abbrechen of the dialog closes it", async () => {
    setViewportWidth(800);
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Abbrechen" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("US-QS-32 · SG-SHEET-04 the confirming action of the pinned bar submits the form that stays in the scroll region", async () => {
    setViewportWidth(800);
    const onSubmit = vi.fn();
    render(
      <ResponsiveModal title="Notiz" open onOpenChange={() => undefined}>
        <BarForm onSubmit={onSubmit} />
      </ResponsiveModal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Notiz" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Sichern" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
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
    expect(
      (screen
        .getByRole("button", { name: "Sichern" })
        .closest("[data-layer-bar]") as Element | null) !== null,
    ).toBe(true);
  });
});

describe("US-QS-32 · SG-FORM-02 a sheet with bar actions in a window too short for its whole header", () => {
  const height = window.innerHeight;
  afterEach(() => {
    window.innerHeight = height;
    document.documentElement.style.fontSize = "";
  });

  /** The keyboard of a phone takes the window down to `high` px, at the root text size `text` (200 % text is 32 px). */
  function open(high: number, text: string, bar = true) {
    setViewportWidth(360);
    window.innerHeight = high;
    document.documentElement.style.fontSize = text;
    render(<Example bar={bar} />);
    return screen.findByRole("dialog", { name: "Notiz" });
  }
  const grabber = (sheet: HTMLElement) => sheet.querySelector(".h-1\\.5");

  it("US-QS-32 · SG-FORM-02 at 200 % text with the keyboard open the grabber is gone and the title is read to assistive technology only, so the bar and a field fit", async () => {
    const sheet = await open(354, "32px");
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    expect(grabber(sheet)).toBeNull();
    const title = within(sheet).getByRole("heading", { name: "Notiz" });
    expect(title.className.split(/\s+/)).toContain("sr-only");
    expect(within(sheet).getByRole("button", { name: "Sichern" })).toBeTruthy();
  });

  it("US-QS-32 · SG-FORM-02 at the default text size the same window keeps the whole header: the grabber and the visible title", async () => {
    const sheet = await open(354, "16px");
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    expect(grabber(sheet)).not.toBeNull();
    const title = within(sheet).getByRole("heading", { name: "Notiz" });
    expect(title.className.split(/\s+/)).not.toContain("sr-only");
  });

  it("US-QS-32 · SG-FORM-02 at 200 % text in a tall window the header stays whole", async () => {
    const sheet = await open(852, "32px");
    await within(sheet).findByRole("button", { name: "Abbrechen" });
    expect(grabber(sheet)).not.toBeNull();
    expect(
      within(sheet).getByRole("heading", { name: "Notiz" }).className.split(/\s+/),
    ).not.toContain("sr-only");
  });

  it("US-QS-32 · SG-SHEET-02 a sheet without bar actions keeps its grabber, its title and its X in a short window", async () => {
    const sheet = await open(354, "32px", false);
    await within(sheet).findByRole("button", { name: "Schließen" });
    expect(grabber(sheet)).not.toBeNull();
    expect(
      within(sheet).getByRole("heading", { name: "Notiz" }).className.split(/\s+/),
    ).not.toContain("sr-only");
  });
});

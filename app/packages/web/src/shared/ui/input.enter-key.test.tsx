// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form, FormControl, FormField, FormItem, FormLabel, FormRoot } from "./form";
import { Select } from "./select";
import { Textarea } from "./textarea";
import { Input } from "./input";
import { DateField } from "./input.date-field";
import { useFieldForm } from "@/shared/ui/form";

afterEach(cleanup);

/** The hint of a field before it got the focus: the hint is set when the field is focused or pressed (SG-FORM-03). */
const hintOf = (label: string) => screen.getByLabelText(label).getAttribute("enterkeyhint");

/** Gives the field the focus, as a keeper does, and reads its hint. */
function focusAndHint(label: string): string | null {
  const el = screen.getByLabelText(label);
  act(() => el.focus());
  return el.getAttribute("enterkeyhint");
}

/** A form of three text fields and a submit button. */
function Three({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  return (
    <FormRoot onSubmit={onSubmit}>
      <Input aria-label="Vorname" />
      <Input aria-label="Nachname" />
      <Input aria-label="Ort" />
      <button type="submit">Sichern</button>
    </FormRoot>
  );
}

describe("Input return-key hint (US-QS-32 · SG-FORM-03)", () => {
  it("US-QS-32 · SG-FORM-03 the hint is set when the field gets the focus: the first two say next, the last one says done", () => {
    render(<Three />);
    expect(hintOf("Vorname")).toBeNull();
    expect(focusAndHint("Vorname")).toBe("next");
    expect(focusAndHint("Nachname")).toBe("next");
    expect(focusAndHint("Ort")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a pointer press sets the hint before the focus arrives", () => {
    render(<Three />);
    fireEvent.pointerDown(screen.getByLabelText("Vorname"));
    expect(hintOf("Vorname")).toBe("next");
  });

  it("US-QS-32 · SG-FORM-03 Enter decides again at press time: a field that appears after the focused one is reached", async () => {
    const onSubmit = vi.fn();
    function Growing({ extra }: { extra: boolean }) {
      return (
        <FormRoot onSubmit={onSubmit}>
          <Input aria-label="Vorname" />
          {extra && <Input aria-label="Zusatz" />}
          <button type="submit">Sichern</button>
        </FormRoot>
      );
    }
    const { rerender } = render(<Growing extra={false} />);
    expect(focusAndHint("Vorname")).toBe("done");
    rerender(<Growing extra />);
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Zusatz"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 an explicit enterKeyHint wins: it is kept on focus, and Enter confirms a send field", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" enterKeyHint="send" />
        <Input aria-label="Nachname" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Vorname")).toBe("send");
    expect(focusAndHint("Nachname")).toBe("done");
    act(() => screen.getByLabelText("Vorname").focus());
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Vorname"));
  });

  it("US-QS-32 · SG-FORM-03 Enter in a field that says next moves the focus to the next field and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<Three onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Vorname"));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Nachname"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 Enter in the last field submits the form, as before", async () => {
    const onSubmit = vi.fn();
    render(<Three onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Ort"));
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-FORM-03 a search field says search, and Enter in it submits instead of moving on", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input type="search" aria-label="Suche" />
        <Input aria-label="Notiz" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Suche")).toBe("search");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Suche"));
  });

  it("US-QS-32 · SG-FORM-03 a search field outside a form (the catalog search) says search, a plain field outside a form has no hint", () => {
    render(
      <>
        <Input type="search" aria-label="Katalog" />
        <Input aria-label="Notiz" />
      </>,
    );
    expect(focusAndHint("Katalog")).toBe("search");
    expect(focusAndHint("Notiz")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-03 every input of a form with role search says search, and Enter submits", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot role="search" aria-label="Suche nach Arten" onSubmit={onSubmit}>
        <Input aria-label="Name" />
        <Input aria-label="Gattung" />
        <button type="submit">Suchen</button>
      </FormRoot>,
    );
    expect(focusAndHint("Name")).toBe("search");
    expect(focusAndHint("Gattung")).toBe("search");
    act(() => screen.getByLabelText("Name").focus());
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("US-QS-32 · SG-FORM-03 a select, a checkbox, a radio and a button are skipped over: Enter reaches the next text field", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" />
        <Select aria-label="Anrede">
          <option>Frau</option>
        </Select>
        <input type="checkbox" aria-label="Newsletter" />
        <input type="radio" name="grund" aria-label="Option A" />
        <button type="button">Hilfe</button>
        <Input aria-label="Ort" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Vorname")).toBe("next");
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Ort"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 a textarea is a text field to move into, and Enter in it keeps the newline", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Titel" />
        <Textarea aria-label="Notiz" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Titel")).toBe("next");
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Notiz"));
    expect(screen.getByLabelText("Notiz").hasAttribute("enterkeyhint")).toBe(false);
    await userEvent.keyboard("{Enter}");
    expect((screen.getByLabelText("Notiz") as HTMLTextAreaElement).value).toBe("\n");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 text, then a select, then submit: the text field is the last text field, so it says done and Enter submits", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" />
        <Select aria-label="Anrede">
          <option>Frau</option>
        </Select>
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Vorname")).toBe("done");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // The field between the two text fields is one the keeper cannot reach; Enter must skip it and reach the next one.
  const unreachable: {
    how: string;
    wrap: (node: ReactNode) => ReactNode;
    props: object;
    stub?: boolean;
  }[] = [
    { how: "is disabled", wrap: (n) => n, props: { disabled: true } },
    { how: "is readOnly", wrap: (n) => n, props: { readOnly: true } },
    { how: "has tabIndex -1", wrap: (n) => n, props: { tabIndex: -1 } },
    { how: "sits in an inert group", wrap: (n) => <div inert>{n}</div>, props: {} },
    {
      how: "sits in an aria-hidden group",
      wrap: (n) => <div aria-hidden="true">{n}</div>,
      props: {},
    },
    { how: "sits in a hidden group", wrap: (n) => <div hidden>{n}</div>, props: {} },
    {
      how: "sits in a closed Mehr Angaben group",
      wrap: (n) => (
        <details>
          <summary>Mehr Angaben</summary>
          {n}
        </details>
      ),
      props: {},
    },
    {
      how: "is not shown by the browser (checkVisibility is false)",
      wrap: (n) => n,
      props: {},
      stub: true,
    },
  ];
  it.each(unreachable)(
    "US-QS-32 · SG-FORM-03 Enter skips a field that $how and reaches the next text field",
    async ({ wrap, props, stub }) => {
      render(
        <FormRoot onSubmit={() => {}}>
          <Input aria-label="Vorname" />
          {wrap(<Input aria-label="Foto" {...props} />)}
          <Input aria-label="Ort" />
          <button type="submit">Sichern</button>
        </FormRoot>,
      );
      if (stub) {
        // jsdom has no layout: the browser's own answer (Element.checkVisibility) is stubbed for this field.
        Object.defineProperty(screen.getByLabelText("Foto"), "checkVisibility", {
          value: () => false,
        });
      }
      expect(focusAndHint("Vorname")).toBe("next");
      await userEvent.keyboard("{Enter}");
      expect(document.activeElement).toBe(screen.getByLabelText("Ort"));
    },
  );

  it("US-QS-32 · SG-FORM-03 the last field is a datalist field: it says done and Enter keeps its default, the submit; the field before it still moves onto it", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Name" />
        <Input aria-label="Zeitzone" list="zeitzonen" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Name")).toBe("next");
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Zeitzone"));
    expect(focusAndHint("Zeitzone")).toBe("done");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-FORM-03 a datalist field with a later text field gets no hint, and Enter does not move the focus: it keeps picking a suggestion", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Zeitzone" list="zeitzonen" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
        <Input aria-label="Ort" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Zeitzone")).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Zeitzone"));
    expect(focusAndHint("Ort")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a datalist field with a later text field stays without hint when the caller sets enterKeyHint next: Enter does not move on", async () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Zeitzone" list="zeitzonen" enterKeyHint="next" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
        <Input aria-label="Ort" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    act(() => screen.getByLabelText("Zeitzone").focus());
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Zeitzone"));
  });

  it("US-QS-32 · SG-FORM-03 the last field is a datalist field but the form cannot submit on Enter (two text fields, no submit button): no hint", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Name" />
        <Input aria-label="Zeitzone" list="zeitzonen" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
      </FormRoot>,
    );
    expect(focusAndHint("Zeitzone")).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 a datalist field that is the only text field of a form without a submit button says done", () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Zeitzone" list="zeitzonen" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
      </FormRoot>,
    );
    expect(focusAndHint("Zeitzone")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a datalist field gives no done when the submit button is disabled", () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Zeitzone" list="zeitzonen" />
        <datalist id="zeitzonen">
          <option value="Europe/Berlin" />
        </datalist>
        <button type="submit" disabled>
          Sichern
        </button>
      </FormRoot>,
    );
    expect(focusAndHint("Zeitzone")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-03 without a submit button, two text fields give no done: the last one has no hint and Enter does not submit", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" />
        <Input aria-label="Ort" />
      </FormRoot>,
    );
    expect(focusAndHint("Vorname")).toBe("next");
    expect(focusAndHint("Ort")).toBeNull();
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 without a submit button, a single text field is the last one: it says done and Enter submits", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" />
      </FormRoot>,
    );
    expect(focusAndHint("Vorname")).toBe("done");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-FORM-03 a disabled submit button cannot submit, so the last field gets no done", () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Vorname" />
        <Input aria-label="Ort" />
        <button type="submit" disabled>
          Sichern
        </button>
      </FormRoot>,
    );
    expect(focusAndHint("Ort")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-03 the field inside the Form family (FormField, FormControl) gets the same hints", () => {
    function Registered() {
      const form = useFieldForm<{ vorname: string; ort: string }>({
        defaultValues: { vorname: "", ort: "" },
      });
      return (
        <Form {...form}>
          <FormRoot onSubmit={() => {}}>
            <FormField
              control={form.control}
              name="vorname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vorname</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ort</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <button type="submit">Sichern</button>
          </FormRoot>
        </Form>
      );
    }
    render(<Registered />);
    expect(focusAndHint("Vorname")).toBe("next");
    expect(focusAndHint("Ort")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 the forwarded ref gets the element once and is not attached again on every render", () => {
    const ref = vi.fn();
    function Stable({ n }: { n: number }) {
      return <Input ref={ref} aria-label="Name" data-render={n} />;
    }
    const { rerender } = render(<Stable n={1} />);
    rerender(<Stable n={2} />);
    rerender(<Stable n={3} />);
    expect(ref).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(screen.getByLabelText("Name"));
  });

  it("US-QS-32 · SG-FORM-03 Enter that confirms an IME composition does not move the focus", () => {
    render(<Three />);
    const first = screen.getByLabelText("Vorname");
    first.focus();
    fireEvent.keyDown(first, { key: "Enter", isComposing: true });
    expect(document.activeElement).toBe(first);
  });

  it("US-QS-32 · SG-FORM-03 a caller's onKeyDown runs first, and an Enter it prevents does not move on", async () => {
    const onKeyDown = vi.fn((event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.preventDefault();
    });
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Vorname" onKeyDown={onKeyDown} />
        <Input aria-label="Nachname" />
      </FormRoot>,
    );
    await userEvent.click(screen.getByLabelText("Vorname"));
    await userEvent.keyboard("{Enter}");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Vorname"));
  });
});

describe("DateField return-key hint (US-QS-32 · SG-FORM-03)", () => {
  it("US-QS-32 · SG-FORM-03 a date field that is the last text field says done, the field before it says next, and Enter moves onto the date field without submitting", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Messwert" />
        <DateField aria-label="Datum" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Messwert")).toBe("next");
    expect(focusAndHint("Datum")).toBe("done");
    act(() => screen.getByLabelText("Messwert").focus());
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Datum"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 a date field before another text field says next, and Enter moves on to that field", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <DateField aria-label="Datum" />
        <Input aria-label="Notiz" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Datum")).toBe("next");
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Notiz"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 an explicit enterKeyHint on a date field wins: it is kept on focus, and Enter submits in place of moving on", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <DateField aria-label="Datum" enterKeyHint="send" />
        <Input aria-label="Notiz" />
        <button type="submit">Sichern</button>
      </FormRoot>,
    );
    expect(focusAndHint("Datum")).toBe("send");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Datum"));
  });

  it("US-QS-32 · SG-FORM-03 a caller's onFocus and onKeyDown on a date field still run, and an Enter the caller prevents does not move on", async () => {
    const onFocus = vi.fn();
    const onKeyDown = vi.fn((event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.preventDefault();
    });
    render(
      <FormRoot onSubmit={() => {}}>
        <DateField aria-label="Datum" onFocus={onFocus} onKeyDown={onKeyDown} />
        <Input aria-label="Notiz" />
      </FormRoot>,
    );
    await userEvent.click(screen.getByLabelText("Datum"));
    expect(onFocus).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Enter}");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Datum"));
  });
});

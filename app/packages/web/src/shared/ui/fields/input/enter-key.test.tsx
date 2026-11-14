// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Form, FormControl, FormField, FormItem, FormLabel, FormRoot } from "../form/form";
import { Textarea } from "../textarea/textarea";
import { Input } from "./input";

afterEach(cleanup);

/** The return-key hint the browser shows for a field (SG-FORM-03). */
const hint = (label: string) => screen.getByLabelText(label).getAttribute("enterkeyhint");

/** A form of three text fields and a submit button, as the Form family builds them. */
function Three({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  return (
    <FormRoot onSubmit={onSubmit}>
      <Input aria-label="Vorname" />
      <Input aria-label="Nachname" />
      <Input aria-label="Ort" />
      <button type="submit">Speichern</button>
    </FormRoot>
  );
}

describe("Input return-key hint (US-QS-32 · SG-FORM-03)", () => {
  it("US-QS-32 · SG-FORM-03 the text fields of a form say next, the last one says done", () => {
    render(<Three />);
    expect(hint("Vorname")).toBe("next");
    expect(hint("Nachname")).toBe("next");
    expect(hint("Ort")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a single field of a form says done", () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Suche nach Art" />
      </FormRoot>,
    );
    expect(hint("Suche nach Art")).toBe("done");
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

  it("US-QS-32 · SG-FORM-03 an explicit enterKeyHint wins over the default, and Enter confirms a send field", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Vorname" enterKeyHint="send" />
        <Input aria-label="Nachname" />
        <button type="submit">Speichern</button>
      </FormRoot>,
    );
    expect(hint("Vorname")).toBe("send");
    expect(hint("Nachname")).toBe("done");
    await userEvent.click(screen.getByLabelText("Vorname"));
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText("Vorname"));
  });

  it("US-QS-32 · SG-FORM-03 an explicit enterKeyHint on the first field is kept when the form grows", async () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Vorname" enterKeyHint="go" />
        <Input aria-label="Nachname" />
      </FormRoot>,
    );
    expect(hint("Vorname")).toBe("go");
    expect(hint("Nachname")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a field that appears gets its hint, and the field before it changes from done to next", async () => {
    function Growing({ extra }: { extra: boolean }) {
      return (
        <FormRoot onSubmit={() => {}}>
          <Input aria-label="Vorname" />
          {extra && <Input aria-label="Zusatz" />}
          <button type="submit">Speichern</button>
        </FormRoot>
      );
    }
    const { rerender } = render(<Growing extra={false} />);
    expect(hint("Vorname")).toBe("done");
    rerender(<Growing extra />);
    await waitFor(() => expect(hint("Vorname")).toBe("next"));
    expect(hint("Zusatz")).toBe("done");
    rerender(<Growing extra={false} />);
    await waitFor(() => expect(hint("Vorname")).toBe("done"));
  });

  it("US-QS-32 · SG-FORM-03 the field inside the Form family (FormField, FormControl) gets the same hints", () => {
    function Registered() {
      const form = useForm<{ vorname: string; ort: string }>({
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
          </FormRoot>
        </Form>
      );
    }
    render(<Registered />);
    expect(hint("Vorname")).toBe("next");
    expect(hint("Ort")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 a search field outside a form says search, a plain field outside a form has no hint", () => {
    render(
      <>
        <Input type="search" aria-label="Suche" />
        <Input aria-label="Notiz" />
      </>,
    );
    expect(hint("Suche")).toBe("search");
    expect(hint("Notiz")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-03 a textarea keeps Enter as a newline: it gets no hint, and Enter in it neither submits nor moves on", async () => {
    const onSubmit = vi.fn();
    render(
      <FormRoot onSubmit={onSubmit}>
        <Input aria-label="Titel" />
        <Textarea aria-label="Notiz" />
        <button type="submit">Speichern</button>
      </FormRoot>,
    );
    expect(hint("Titel")).toBe("next");
    expect(screen.getByLabelText("Notiz").hasAttribute("enterkeyhint")).toBe(false);
    await userEvent.click(screen.getByLabelText("Notiz"));
    await userEvent.keyboard("{Enter}");
    expect((screen.getByLabelText("Notiz") as HTMLTextAreaElement).value).toBe("\n");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-03 a field the browser does not show is no next field, so Enter reaches the field behind it", async () => {
    render(
      <FormRoot onSubmit={() => {}}>
        <Input aria-label="Vorname" />
        <Input aria-label="Foto" />
        <Input aria-label="Ort" />
      </FormRoot>,
    );
    // jsdom has no layout: the browser's own answer (Element.checkVisibility) is stubbed for the field that is hidden.
    Object.defineProperty(screen.getByLabelText("Foto"), "checkVisibility", { value: () => false });
    await userEvent.click(screen.getByLabelText("Vorname"));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Ort"));
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

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormRoot, useFieldForm } from "./form";
import { Input } from "./input";
import { FormMoreFields, MoreFields } from "./form.more-fields";

afterEach(cleanup);

type Values = { name: string; note: string };

/** A form with one required field and one optional field behind the disclosure; the buttons fill or refuse it from outside. */
function Harness() {
  const form = useFieldForm<Values>({ defaultValues: { name: "", note: "" } });
  return (
    <>
      <button type="button" onClick={() => form.setValue("note", "Kurz")}>
        Hinweis setzen
      </button>
      <button
        type="button"
        onClick={() => form.setError("note", { type: "server", message: "Zu lang." })}
      >
        Fehler setzen
      </button>
      <label>
        Name
        <input {...form.register("name")} />
      </label>
      <FormMoreFields control={form.control} names={["note"]}>
        <label>
          Notiz
          <input
            aria-invalid={form.formState.errors.note ? "true" : undefined}
            {...form.register("note")}
          />
        </label>
      </FormMoreFields>
    </>
  );
}

const disclosure = (container: HTMLElement) =>
  container.querySelector("details") as HTMLDetailsElement;

describe("US-QS-24 the shared disclosure Mehr Angaben (issue 1032)", () => {
  it("US-QS-24 is closed by default and is named Mehr Angaben", () => {
    const { container } = render(<Harness />);
    expect(disclosure(container).open).toBe(false);
    expect(screen.getByText("Mehr Angaben")).toBeTruthy();
  });

  it("US-QS-24 opens on a click and closes again on the next click when nothing inside is filled", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByText("Mehr Angaben"));
    expect(disclosure(container).open).toBe(true);
    await userEvent.click(screen.getByText("Mehr Angaben"));
    expect(disclosure(container).open).toBe(false);
  });

  it("US-QS-15 the group is one column that may shrink, so a wide field wraps inside it at a large text size (DS-61)", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByText("Mehr Angaben"));
    const group = disclosure(container).querySelector(":scope > div") as HTMLElement;
    expect(group.className).toContain("min-w-0");
    expect(group.className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("US-QS-15 opens by itself when a hidden field holds a value", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Hinweis setzen" }));
    await vi.waitFor(() => expect(disclosure(container).open).toBe(true));
  });

  it("US-QS-15 opens by itself when a hidden field is refused, and the refused field takes the focus", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Fehler setzen" }));
    await vi.waitFor(() => expect(disclosure(container).open).toBe(true));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Notiz")));
  });

  it("US-QS-15 a filled disclosure cannot be closed, so nothing is hidden silently (P-10)", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Hinweis setzen" }));
    await vi.waitFor(() => expect(disclosure(container).open).toBe(true));
    await userEvent.click(screen.getByText("Mehr Angaben"));
    expect(disclosure(container).open).toBe(true);
  });
});

/** A form whose one optional field sits behind "Mehr Angaben" (closed by default), as the wish form does. */
function Revealing({ onSubmit }: { onSubmit: () => void }) {
  return (
    <FormRoot onSubmit={onSubmit}>
      <Input aria-label="Name" />
      <MoreFields>
        <Input aria-label="Notiz" />
      </MoreFields>
      <button type="submit">Sichern</button>
    </FormRoot>
  );
}

/** The hint of a field once it got the focus (SG-FORM-03: the hint is set on focus and decided again on Enter). */
async function focusedHint(label: string): Promise<string | null> {
  await userEvent.click(screen.getByLabelText(label));
  return screen.getByLabelText(label).getAttribute("enterkeyhint");
}

describe("US-QS-32 · SG-FORM-03 the return-key hint follows Mehr Angaben", () => {
  it("US-QS-32 · SG-FORM-03 a field behind a closed Mehr Angaben group is no next field: the field before it says done", async () => {
    render(<Revealing onSubmit={() => {}} />);
    expect(await focusedHint("Name")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 Enter in that field submits while the group is closed, as the label done says", async () => {
    const onSubmit = vi.fn();
    render(<Revealing onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("US-QS-32 · SG-FORM-03 opening Mehr Angaben gives the field before it next and the revealed field done", async () => {
    const { container } = render(<Revealing onSubmit={() => {}} />);
    await userEvent.click(screen.getByText("Mehr Angaben"));
    expect(disclosure(container).open).toBe(true);
    expect(await focusedHint("Name")).toBe("next");
    expect(await focusedHint("Notiz")).toBe("done");
  });

  it("US-QS-32 · SG-FORM-03 Enter in the field before an open Mehr Angaben group moves into the group and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<Revealing onSubmit={onSubmit} />);
    await userEvent.click(screen.getByText("Mehr Angaben"));
    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Notiz"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

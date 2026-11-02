// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormMoreFields } from "./more-fields";

afterEach(cleanup);

type Values = { name: string; note: string };

/** A form with one required field and one optional field behind the disclosure; the buttons fill or refuse it from outside. */
function Harness() {
  const form = useForm<Values>({ defaultValues: { name: "", note: "" } });
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

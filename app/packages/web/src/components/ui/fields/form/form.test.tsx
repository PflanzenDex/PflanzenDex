// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { applyServerError } from "@/lib/error-text";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
} from "./form";
import { Input } from "../input/input";

afterEach(cleanup);

const schema = z.object({ name: z.string().min(1, "Bitte einen Namen eingeben.") });
type Values = z.infer<typeof schema>;

function Demo({
  onValid = () => {},
  serverFail = false,
}: {
  onValid?: (v: Values) => void;
  serverFail?: boolean;
}) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });
  return (
    <Form {...form}>
      <FormRoot
        onSubmit={form.handleSubmit((v) => {
          onValid(v);
          if (serverFail)
            applyServerError(
              { code: "input.invalid", details: [{ field: "name", code: "access.denied" }] },
              (n, e) => form.setError(n as "name", e),
            );
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Wie heißt die Pflanze?</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormMessage name="root.server" />
        <button type="submit">Speichern</button>
      </FormRoot>
    </Form>
  );
}

describe("Form (US-QS-07 · DS-47, DS-48)", () => {
  it("US-QS-07 · DS-48 wires label, description and control without hand-made ids", () => {
    render(<Demo />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described.split(" ")[0] ?? "")?.textContent).toBe(
      "Wie heißt die Pflanze?",
    );
  });

  it("US-QS-07 · DS-47 submitting empty focuses the first invalid field and announces the message", async () => {
    const onValid = vi.fn();
    render(<Demo onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const input = screen.getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Bitte einen Namen eingeben.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect((input.getAttribute("aria-describedby") ?? "").split(" ")).toContain(alert.id);
    expect(onValid).not.toHaveBeenCalled();
  });

  it("US-QS-07 · DS-47 clears the message once the field is valid", async () => {
    const onValid = vi.fn();
    render(<Demo onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("alert");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Monstera");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onValid).toHaveBeenCalledWith({ name: "Monstera" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-07 · DS-49 shows the German text of a server error on its field and on the form", async () => {
    render(<Demo serverFail />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "x");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const alerts = await screen.findAllByRole("alert");
    const texts = alerts.map((a) => a.textContent);
    expect(texts).toContain("Darauf hast du keinen Zugriff.");
    expect(texts).toContain("Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.");
  });

  it("US-QS-07 · DS-47 FormMessage shows caller text when there is no error, nothing otherwise", () => {
    render(<Demo />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("FormRoot (US-QS-07 · DS-48)", () => {
  it("US-QS-07 · DS-48 renders a native form without browser validation bubbles", () => {
    render(<FormRoot aria-label="Pflanze" />);
    const form = screen.getByRole("form", { name: "Pflanze" });
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveProperty("noValidate", true);
  });

  it("US-QS-07 · DS-48 sends the values through the provider's submit and blocks invalid ones", async () => {
    const onValid = vi.fn();
    render(<Demo onValid={onValid} />);
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Bitte einen Namen eingeben.");
    expect(onValid).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Monstera" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: "Monstera" });
  });

  it("US-QS-07 · DS-48 prevents the native page reload even without a handler", () => {
    render(<FormRoot aria-label="Suche" />);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    screen.getByRole("form", { name: "Suche" }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("US-QS-07 · DS-48 keeps className, role and ref of the caller", () => {
    const ref = { current: null as HTMLFormElement | null };
    render(<FormRoot ref={ref} role="search" className="max-w-xl" />);
    expect(screen.getByRole("search").className).toContain("max-w-xl");
    expect(ref.current?.tagName).toBe("FORM");
  });
});

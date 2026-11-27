// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { applyServerError } from "@/shared/lib/error-text";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRoot,
  useFieldForm,
} from "./form";
import { Input } from "./input";
import { Button } from "./button";

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
  const form = useFieldForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });
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
        <button type="submit">Sichern</button>
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await screen.findByRole("alert");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Monstera");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onValid).toHaveBeenCalledWith({ name: "Monstera" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-07 · DS-49 shows the German text of a server error on its field and on the form", async () => {
    render(<Demo serverFail />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "x");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
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

function Bare({ withMessageText = false }: { withMessageText?: boolean }) {
  const form = useFieldForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });
  return (
    <Form {...form}>
      <FormRoot onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              {withMessageText ? <FormMessage>Optional</FormMessage> : <FormMessage />}
            </FormItem>
          )}
        />
        <button type="submit">Sichern</button>
      </FormRoot>
    </Form>
  );
}

function describedIds(element: HTMLElement) {
  return (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
}

describe("Form aria-describedby (US-QS-14)", () => {
  it("US-QS-14 · a field without description and error has no aria-describedby", () => {
    render(<Bare />);
    expect(screen.getByRole("textbox", { name: "Name" }).hasAttribute("aria-describedby")).toBe(
      false,
    );
  });

  it("US-QS-14 · a field without description points only at its error message", async () => {
    render(<Bare />);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    const alert = await screen.findByRole("alert");
    expect(describedIds(screen.getByRole("textbox", { name: "Name" }))).toEqual([alert.id]);
  });

  it("US-QS-14 · a visible caller message without error is linked to the field", () => {
    render(<Bare withMessageText />);
    const ids = describedIds(screen.getByRole("textbox", { name: "Name" }));
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(["Optional"]);
  });

  it("US-QS-14 · every id in aria-describedby exists, before and after an error", async () => {
    render(<Demo />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(describedIds(input)).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await screen.findByRole("alert");
    expect(describedIds(input)).toHaveLength(2);
    for (const id of describedIds(input)) expect(document.getElementById(id)).not.toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Bitte einen Namen eingeben.");
    expect(onValid).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Monstera" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sichern" }));
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

function NetworkForm({ onValid }: { onValid: (v: Values) => void }) {
  const form = useFieldForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "" } });
  return (
    <Form {...form}>
      <FormRoot onSubmit={form.handleSubmit(onValid)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" needsNetwork>
          Sichern
        </Button>
      </FormRoot>
    </Form>
  );
}

describe("Form needs the network (US-QS-30 · SG-BTN-05)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("US-QS-30 · offline a submit that needs the network does not send, keeps the input and says why", async () => {
    const onValid = vi.fn();
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    render(<NetworkForm onValid={onValid} />);
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.type(input, "Monstera");
    state.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    const button = screen.getByRole("button", { name: "Sichern" });
    await userEvent.click(button);
    await userEvent.type(input, "{enter}");
    expect(onValid).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("Monstera");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Du bist offline. Das geht erst wieder mit Verbindung.");
  });

  it("US-QS-30 · online again the same submit sends the typed input", async () => {
    const onValid = vi.fn();
    const state = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<NetworkForm onValid={onValid} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Monstera");
    state.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: "Monstera" });
  });
});

const pairSchema = z.object({
  name: z.string().min(1, "Gib einen Namen ein."),
  note: z.string().min(1, "Gib eine Notiz ein."),
});
type PairValues = z.infer<typeof pairSchema>;

function Pair({ onValid = () => {} }: { onValid?: (v: PairValues) => void }) {
  const form = useFieldForm<PairValues>({
    resolver: zodResolver(pairSchema),
    defaultValues: { name: "", note: "" },
  });
  return (
    <Form {...form}>
      <FormRoot onSubmit={form.handleSubmit(onValid)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notiz</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Sichern</button>
      </FormRoot>
    </Form>
  );
}

/**
 * Reads the frame (aria-invalid), the label colour and the message of one field at every DOM change of its item, so a
 * state where they disagree is seen even when it lasts one render (SG-FORM-05).
 */
function watchField(input: HTMLElement) {
  const item = input.parentElement as HTMLElement;
  const states: string[] = [];
  const snap = () => {
    const framed = input.getAttribute("aria-invalid") === "true";
    const red = item.querySelector("label")?.className.includes("text-destructive") ?? false;
    const message = item.querySelector('[role="alert"]') !== null;
    states.push(`${framed}|${red}|${message}`);
  };
  const observer = new MutationObserver(snap);
  observer.observe(item, { subtree: true, attributes: true, childList: true, characterData: true });
  snap();
  return { states, stop: () => observer.disconnect() };
}

describe("useFieldForm (US-QS-32 · SG-FORM-05)", () => {
  it("US-QS-32 · SG-FORM-05 a field left empty shows its message, red frame and label, and a valid value clears all three in one render", async () => {
    render(<Pair />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.click(name);
    await userEvent.click(document.body);
    await screen.findByRole("alert");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const watch = watchField(name);
    await userEvent.type(name, "Monstera");
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBeNull());
    watch.stop();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(watch.states).toContain("true|true|true");
    expect(watch.states.filter((s) => new Set(s.split("|")).size > 1)).toEqual([]);
    expect(watch.states.at(-1)).toBe("false|false|false");
  });

  it("US-QS-32 · SG-FORM-05 no error shows while the first characters are typed in a field not yet left", async () => {
    render(<Pair />);
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.type(name, "M{Backspace}");
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-05 a send marks every empty field and moves the focus to the first wrong one", async () => {
    const onValid = vi.fn();
    render(<Pair onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    const note = screen.getByRole("textbox", { name: "Notiz" });
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(note.getAttribute("aria-invalid")).toBe("true");
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([
      "Gib einen Namen ein.",
      "Gib eine Notiz ein.",
    ]);
    expect(onValid).not.toHaveBeenCalled();
  });

  it("US-QS-32 · SG-FORM-05 after a send, correcting one field clears its frame, label and message together and keeps the other error", async () => {
    render(<Pair />);
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    const note = screen.getByRole("textbox", { name: "Notiz" });
    await waitFor(() => expect(document.activeElement).toBe(name));
    const watch = watchField(name);
    await userEvent.type(name, "Monstera");
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBeNull());
    watch.stop();
    expect(watch.states.filter((s) => new Set(s.split("|")).size > 1)).toEqual([]);
    expect(note.getAttribute("aria-invalid")).toBe("true");
    expect((await screen.findByRole("alert")).textContent).toBe("Gib eine Notiz ein.");
  });

  it("US-QS-32 · SG-FORM-05 a tap on send while a field is focused does not leave the field before the press ends, then moves the focus to the first wrong one (issue 2216)", async () => {
    const onValid = vi.fn();
    render(<Pair onValid={onValid} />);
    const name = screen.getByRole("textbox", { name: "Name" });
    const note = screen.getByRole("textbox", { name: "Notiz" });
    const send = screen.getByRole("button", { name: "Sichern" });
    const user = userEvent.setup();
    await user.click(note);
    // The press starts: the field keeps the focus, so no message appears and nothing moves under the finger.
    await user.pointer({ keys: "[MouseLeft>]", target: send });
    await act(async () => {});
    expect(document.activeElement).toBe(note);
    expect(screen.queryByRole("alert")).toBeNull();
    // The press ends on the same button: the send runs and the first wrong field takes the focus, not the button.
    await user.pointer({ keys: "[/MouseLeft]", target: send });
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(note.getAttribute("aria-invalid")).toBe("true");
    expect(onValid).not.toHaveBeenCalled();
  });

  it("US-QS-32 · US-QS-14 a press on a valid send goes through and leaves the focus on the send button (issue 2216)", async () => {
    const onValid = vi.fn();
    render(<Pair onValid={onValid} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Monstera");
    const note = screen.getByRole("textbox", { name: "Notiz" });
    await userEvent.type(note, "Fenster");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0]?.[0]).toEqual({ name: "Monstera", note: "Fenster" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sichern" }));
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Form, FormRoot, useFieldForm } from "@/shared/ui/form";
import { Field } from "@/shared/ui/field";
import { DateField, parseDateText, showDateText } from "./input.date-field";
import { NO_DAY_TEXT, dateValue, requiredDate } from "./input.date-schema";

const NO_DAY = "Kein gültiges Datum. Gib es als TT.MM.JJJJ an.";

/** The device's pointer for one test: `coarse` answers `(pointer: coarse)` with true, the rest with false. */
const realMatchMedia = window.matchMedia;
function pointer(kind: "coarse" | "fine") {
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" && kind === "coarse",
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => pointer("fine"));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe("DateField (US-QS-24, US-QS-32, NFR-08)", () => {
  it("US-QS-24 shows a calendar date as dd.mm.yyyy and keeps the YYYY-MM-DD value", () => {
    render(<DateField aria-label="Fangdatum" value="2026-10-30" onChange={() => {}} />);
    expect((screen.getByLabelText("Fangdatum") as HTMLInputElement).value).toBe("30.10.2026");
  });

  it("US-QS-24 typed German text reaches the caller as a local calendar date", async () => {
    const seen: string[] = [];
    function Host() {
      const [v, setV] = useState("");
      return (
        <DateField
          aria-label="Tag"
          value={v}
          onChange={(e) => {
            seen.push(e.target.value);
            setV(e.target.value);
          }}
        />
      );
    }
    render(<Host />);
    await userEvent.type(screen.getByLabelText("Tag"), "09.03.2026");
    expect(seen.at(-1)).toBe("2026-03-09");
    expect(seen.slice(0, -1).some((s) => /^\d{4}-/.test(s))).toBe(false);
    expect((screen.getByLabelText("Tag") as HTMLInputElement).value).toBe("09.03.2026");
  });

  it("US-QS-32 an impossible day is handed on as the typed text, never as an empty value", () => {
    const onChange = vi.fn();
    render(<DateField aria-label="Tag" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "31.02.2026" } });
    expect(onChange.mock.calls[0]?.[0].target.value).toBe("31.02.2026");
  });

  it("US-QS-32 no message and no invalid mark while the keeper is typing", async () => {
    render(<DateField aria-label="Tag" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag");
    await userEvent.type(input, "31.02.20");
    expect(screen.queryByText(NO_DAY)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("US-QS-32 leaving a day that does not exist shows one message under the field, linked to it, and keeps the text", async () => {
    render(<DateField aria-label="Tag" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag");
    await userEvent.type(input, "31.02.2026");
    await userEvent.tab();
    const message = screen.getByText(NO_DAY);
    expect(message.getAttribute("role")).toBe("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect((input as HTMLInputElement).value).toBe("31.02.2026");
    expect(screen.getAllByText(NO_DAY)).toHaveLength(1);
  });

  it("US-QS-32 a day after max is marked invalid when the field is left, not before", () => {
    render(<DateField aria-label="Tag" value="2026-11-01" max="2026-10-30" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Wähle ein Datum bis zum 30.10.2026.")).toBeTruthy();
  });

  it("US-QS-32 a real day after max says the last day to choose, not that the text is no day (SG-FORM-05)", async () => {
    render(<DateField aria-label="Tag" max="2026-10-30" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag");
    await userEvent.type(input, "01.11.2026");
    await userEvent.tab();
    expect(screen.getByRole("alert").textContent).toBe("Wähle ein Datum bis zum 30.10.2026.");
    expect(screen.queryByText(NO_DAY)).toBeNull();
  });

  it("US-QS-32 a real day before min says the first day to choose, not that the text is no day (SG-FORM-05)", async () => {
    render(<DateField aria-label="Tag" min="2026-01-01" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag");
    await userEvent.type(input, "31.12.2025");
    await userEvent.tab();
    expect(screen.getByRole("alert").textContent).toBe("Wähle ein Datum ab dem 01.01.2026.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText(NO_DAY)).toBeNull();
  });

  it("US-QS-32 the typed field keeps its German placeholder", () => {
    render(<DateField aria-label="Tag" value="2026-11-01" max="2026-10-30" onChange={() => {}} />);
    expect(screen.getByLabelText("Tag").getAttribute("placeholder")).toBe("TT.MM.JJJJ");
  });

  it("US-QS-32 focus selects the whole text of the typed field (Q-134)", () => {
    render(<DateField aria-label="Tag" value="2026-03-09" onChange={() => {}} />);
    const input = screen.getByLabelText("Tag") as HTMLInputElement;
    act(() => input.focus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(10);
  });

  it("US-QS-32 parse and show are pure calendar arithmetic (leap day, no time zone)", () => {
    expect(parseDateText("29.02.2028")).toBe("2028-02-29");
    expect(parseDateText("29.02.2026")).toBe("");
    expect(parseDateText("2026-03-09")).toBe("2026-03-09");
    expect(showDateText("2026-03-09")).toBe("09.03.2026");
  });

  it("US-QS-32 a refused date in a form shows exactly one message under the field and blocks the save", async () => {
    const onValid = vi.fn();
    function Host() {
      const form = useFieldForm<{ date: string }>({
        resolver: zodResolver(z.object({ date: requiredDate("Gib ein Datum an.") })),
        defaultValues: { date: "2026-03-09" },
      });
      return (
        <Form {...form}>
          <FormRoot onSubmit={form.handleSubmit(onValid)}>
            <Field control={form.control} name="date" label="Datum">
              {(field) => <DateField {...field} />}
            </Field>
            <button type="submit">Sichern</button>
          </FormRoot>
        </Form>
      );
    }
    render(<Host />);
    const input = screen.getByLabelText("Datum");
    await userEvent.clear(input);
    await userEvent.type(input, "31.02.2026");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    expect(onValid).not.toHaveBeenCalled();
    expect(screen.getAllByText(NO_DAY)).toHaveLength(1);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("US-QS-32 touch devices use the system date picker (SG-CTRL-03)", () => {
  it("US-QS-32 a coarse pointer renders a date input with the local calendar dates as value, min and max", () => {
    pointer("coarse");
    render(
      <DateField
        aria-label="Datum"
        value="2026-03-09"
        min="2020-01-01"
        max="2026-10-30"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText("Datum") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-03-09");
    expect(input.min).toBe("2020-01-01");
    expect(input.max).toBe("2026-10-30");
    expect(input.getAttribute("placeholder")).toBeNull();
    expect(input.getAttribute("maxlength")).toBeNull();
    expect(input.getAttribute("inputmode")).toBeNull();
  });

  it("US-QS-32 a coarse pointer hands the picked date on unchanged", () => {
    pointer("coarse");
    // The caller reads the value inside its handler, as react-hook-form and the forms do: React resets a controlled
    // input after the event, so the value is read at once.
    const seen: string[] = [];
    render(
      <DateField
        aria-label="Datum"
        value=""
        onChange={(e) => {
          seen.push(e.target.value);
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-03-09" } });
    expect(seen).toEqual(["2026-03-09"]);
  });

  it("US-QS-32 a fine pointer keeps the typed field", () => {
    pointer("fine");
    render(<DateField aria-label="Datum" value="2026-03-09" onChange={() => {}} />);
    const input = screen.getByLabelText("Datum") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("09.03.2026");
  });

  it("US-QS-32 the schema helper refuses a text that is no real day and accepts empty and YYYY-MM-DD", () => {
    const optional = dateValue();
    expect(optional.safeParse("").success).toBe(true);
    expect(optional.safeParse("2026-03-09").success).toBe(true);
    expect(optional.safeParse("31.02.2026").success).toBe(false);
    const required = requiredDate("Gib ein Datum an.");
    expect(required.safeParse("").error?.issues[0]?.message).toBe("Gib ein Datum an.");
    expect(required.safeParse("2026-03-09").success).toBe(true);
    expect(required.safeParse("31.02.2026").error?.issues[0]?.message).toBe(NO_DAY_TEXT);
  });
});

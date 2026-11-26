// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Form, FormRoot, useFieldForm } from "./form";
import { Input } from "./input";
import { Field } from "./field";

// US-QS-32 · SG-FORM-01: an optional field says "optional" after its label, a unit stands as a suffix inside the field.
afterEach(cleanup);

type Values = { diameterCm: string };

function Demo(props: { optional?: boolean; suffix?: string }) {
  const form = useFieldForm<Values>({ defaultValues: { diameterCm: "" } });
  return (
    <Form {...form}>
      <FormRoot>
        <Field
          control={form.control}
          name="diameterCm"
          label="Durchmesser"
          optional={props.optional}
          suffix={props.suffix}
        >
          {(field) => <Input {...field} inputMode="decimal" />}
        </Field>
      </FormRoot>
    </Form>
  );
}

describe("US-QS-32 · SG-FORM-01 the Field marks optional fields and shows units inside the field", () => {
  it("US-QS-32 · SG-FORM-01 an optional field renders ' (optional)' after its label", () => {
    render(<Demo optional />);
    expect(screen.getByLabelText("Durchmesser (optional)")).toBeTruthy();
    expect(screen.queryByLabelText("Durchmesser")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-01 a required field says nothing: its label is the bare text", () => {
    render(<Demo />);
    expect(screen.getByLabelText("Durchmesser")).toBeTruthy();
    expect(screen.queryByText(/optional/)).toBeNull();
    expect(screen.queryByText("*")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-01 a unit is a suffix inside the field and not part of the label", () => {
    render(<Demo suffix="cm" />);
    const input = screen.getByLabelText("Durchmesser");
    expect(screen.getByText("Durchmesser").tagName).toBe("LABEL");
    expect(screen.getByText("Durchmesser").textContent).toBe("Durchmesser");
    const suffix = screen.getByText("cm");
    // The suffix sits in the same box as the input, at its right edge.
    expect(input.parentElement?.contains(suffix)).toBe(true);
    expect(suffix.className).toContain("absolute");
    expect(suffix.className).toContain("end-0");
  });

  it("US-QS-32 · SG-FORM-01 the screen reader reads the unit as the description of the field", () => {
    render(<Demo suffix="cm" />);
    const input = screen.getByLabelText("Durchmesser");
    const described = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    const suffix = screen.getByText("cm");
    expect(described).toContain(suffix.id);
  });

  it("US-QS-32 · DS-18 a field with a suffix keeps its text at 16 px", () => {
    render(<Demo optional suffix="cm" />);
    expect(screen.getByLabelText("Durchmesser (optional)").className).toContain("text-base");
  });
});

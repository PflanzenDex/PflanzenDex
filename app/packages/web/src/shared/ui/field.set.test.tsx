// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import { FieldLegend, FieldSet } from "./field.set";

// US-QS-09 (WCAG 1.3.1, 4.1.2): a set of related checkboxes or radios has one name, read before each control.
afterEach(cleanup);

describe("US-QS-09 · FieldSet and FieldLegend name a group of controls", () => {
  it("US-QS-09 a FieldSet renders a fieldset, a FieldLegend its legend, and the group has the legend's name", () => {
    render(
      <FieldSet>
        <FieldLegend>Pflanzen</FieldLegend>
      </FieldSet>,
    );
    const group = screen.getByRole("group", { name: "Pflanzen" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend")?.textContent).toBe("Pflanzen");
  });

  it("US-QS-09 a set of checkboxes is named by its legend, and each box keeps its own label", () => {
    render(
      <FieldSet>
        <FieldLegend>Pflanzen</FieldLegend>
        <Checkbox>Aloe</Checkbox>
        <Checkbox>Farn</Checkbox>
      </FieldSet>,
    );
    const group = screen.getByRole("group", { name: "Pflanzen" });
    const boxes = within(group).getAllByRole("checkbox");
    expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual(["Aloe", "Farn"]);
    expect(screen.getByRole("checkbox", { name: "Aloe" })).toBeTruthy();
  });

  it("US-QS-09 a set of radios is named by its legend", () => {
    render(
      <FieldSet>
        <FieldLegend>Wie nutzt du die App?</FieldLegend>
        <label>
          <input type="radio" name="style" value="few" /> Wenig
        </label>
        <label>
          <input type="radio" name="style" value="many" /> Viel
        </label>
      </FieldSet>,
    );
    const group = screen.getByRole("group", { name: "Wie nutzt du die App?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
  });

  it("US-QS-09 a hidden legend still names the group but takes no place on the screen", () => {
    render(
      <FieldSet>
        <FieldLegend srOnly>Erinnerungen aussetzen</FieldLegend>
        <Checkbox>Gießen</Checkbox>
      </FieldSet>,
    );
    const group = screen.getByRole("group", { name: "Erinnerungen aussetzen" });
    const legend = group.querySelector("legend");
    expect(legend?.className).toContain("sr-only");
    expect(legend?.className).not.toContain("mb-1.5");
    expect(legend?.className).not.toContain("text-base");
  });

  it("US-QS-09 the legend comes in two sizes: 'legend' (16 px) and 'label' (14 px, the size of a field label)", () => {
    render(
      <>
        <FieldSet>
          <FieldLegend>Groß</FieldLegend>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Klein</FieldLegend>
        </FieldSet>
      </>,
    );
    expect(screen.getByText("Groß").getAttribute("data-variant")).toBe("legend");
    expect(screen.getByText("Groß").className).toContain("text-base");
    expect(screen.getByText("Klein").getAttribute("data-variant")).toBe("label");
    expect(screen.getByText("Klein").className).toContain("text-sm");
  });

  it("US-QS-09 a fieldset can shrink inside a flex row (min-w-0) and caller classes win over the defaults", () => {
    render(
      <FieldSet className="gap-0 rounded-lg border-2" data-testid="set">
        <FieldLegend className="mb-0 px-1 text-lg font-semibold">Pflanzen</FieldLegend>
      </FieldSet>,
    );
    const set = screen.getByTestId("set");
    expect(set.className).toContain("min-w-0");
    expect(set.className).toContain("gap-0");
    expect(set.className).not.toContain("gap-4");
    expect(set.className).toContain("border-2");
    const legend = screen.getByText("Pflanzen");
    expect(legend.className).toContain("mb-0");
    expect(legend.className).not.toContain("mb-1.5");
    expect(legend.className).toContain("font-semibold");
    expect(legend.className).not.toContain("font-medium");
    expect(legend.className).toContain("text-lg");
    expect(legend.className).not.toContain("text-base");
  });

  it("US-QS-09 attributes reach the fieldset: a message can describe the group and the group can be disabled", () => {
    render(
      <>
        <FieldSet aria-describedby="why" disabled>
          <FieldLegend>Pflanzen</FieldLegend>
          <Checkbox>Aloe</Checkbox>
        </FieldSet>
        <p id="why">Wähle mindestens eine Pflanze.</p>
      </>,
    );
    const group = screen.getByRole("group", { name: "Pflanzen" });
    expect(group.getAttribute("aria-describedby")).toBe("why");
    expect((group as HTMLFieldSetElement).disabled).toBe(true);
    // The controls inside a disabled fieldset match `:disabled`, though their own `disabled` property stays false.
    expect(screen.getByRole("checkbox").matches(":disabled")).toBe(true);
  });
});

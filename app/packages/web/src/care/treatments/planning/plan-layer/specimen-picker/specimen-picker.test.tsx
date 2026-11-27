// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { Form } from "@/shared/ui/form";
import type { TreatableSpecimen } from "../../../../shared/api/treatments-api";
import { treatmentDefaults, type TreatmentFields } from "../../../../shared/schemas";
import { SpecimenPicker } from "./specimen-picker";

afterEach(cleanup);

const specimens: TreatableSpecimen[] = [
  { id: "p1", name: "Monstera", location: "Fenster" },
  { id: "p2", name: "Aloe", location: "Bad" },
  { id: "p3", name: "Efeu", location: null },
];

function Harness() {
  const form = useForm<TreatmentFields>({ defaultValues: treatmentDefaults("2026-11-19") });
  return (
    <MemoryRouter>
      <Form {...form}>
        <SpecimenPicker control={form.control} specimens={specimens} />
      </Form>
    </MemoryRouter>
  );
}

describe("US-QS-32 · SG-SEARCH-01 the search of the plant picker", () => {
  it("US-QS-32 · SG-SEARCH-01 the search field is named 'Pflanze suchen', shows an example and comes before the location filter", () => {
    render(<Harness />);
    const search = screen.getByRole("searchbox", { name: "Pflanze suchen" });
    expect(search.getAttribute("placeholder")).toBe("Name oder Gattung");
    const place = screen.getByRole("combobox", { name: "Standort" });
    expect(search.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("US-QS-32 · SG-SEARCH-01 the search still narrows the plants while typing", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Pflanze suchen" }), "Mon");
    expect(screen.getByRole("checkbox", { name: /Monstera/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Aloe/ })).toBeNull();
  });
});

describe("US-QS-32 · issue 1960 the location filter", () => {
  it("US-QS-32 · issue 1960 the location is a visible field 'Standort' and full width, so 'Alle Standorte' is never cut", () => {
    render(<Harness />);
    const place = screen.getByRole("combobox", { name: "Standort" });
    const label = screen.getByText("Standort", { selector: "label" });
    expect(label.getAttribute("for")).toBe(place.id);
    expect(place.className.split(" ")).toContain("w-full");
    expect(place.className.split(" ")).not.toContain("w-36");
    expect(screen.getByRole("option", { name: "Alle Standorte" })).toBeTruthy();
  });

  it("US-QS-32 · issue 1960 the location filter narrows the plants to that location", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "Standort" }), {
      target: { value: "Bad" },
    });
    expect(screen.getByRole("checkbox", { name: /Aloe/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Monstera/ })).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationForm } from "./locations-view";

afterEach(cleanup);

describe("US-LIC-05 location form (US-QS-32 · F-0186)", () => {
  it("US-QS-32 · F-0186 after an empty send, typing 'Probe Standort' clears the frame, the label and the message together", async () => {
    const onSave = vi.fn(async () => null);
    render(<LocationForm zones={[]} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Standort anlegen" }));
    const name = screen.getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await userEvent.type(name, "Probe Standort");

    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBeNull());
    expect(screen.queryAllByRole("alert")).toEqual([]);
    const label = [...document.querySelectorAll("label")].find((l) => l.textContent === "Name");
    expect(label?.className.includes("text-destructive")).toBe(false);
  });
});

const zone = { id: "z1", name: "Zone 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };

describe("US-QS-32 · issue 1960 the light zone of a location", () => {
  it("US-QS-32 · issue 1960 the empty choice reads 'Keine Lichtzone', and one line under the field says what it does", () => {
    render(<LocationForm zones={[zone]} onSave={vi.fn(async () => null)} />);
    const select = screen.getByRole("combobox", { name: "Lichtzone" });
    expect(screen.getByRole("option", { name: "Keine Lichtzone" })).toBeTruthy();
    const hint = screen.getByText("Ohne Lichtzone erscheint der Standort in den Hinweisen.");
    expect((select.getAttribute("aria-describedby") ?? "").split(" ")).toContain(hint.id);
  });
});

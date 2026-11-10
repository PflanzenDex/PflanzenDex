// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentInput } from "../equipment-api";
import { EquipmentForm } from "./equipment-form";

// US-BES-19: the pot fields of the equipment form (DM-EQU-05), through the form the keeper fills in. An unknown value
// is sent as unknown (null, P-08); the pot fields go to a pot only.
afterEach(cleanup);

function renderForm() {
  const onSend = vi.fn<(input: EquipmentInput) => Promise<boolean>>(async () => true);
  render(<EquipmentForm zones={[]} running={false} message={null} error={null} onSend={onSend} />);
  return onSend;
}

const save = () => userEvent.click(screen.getByRole("button", { name: "Gerät speichern" }));

describe("US-BES-19 the pot fields of the equipment form", () => {
  it("US-BES-19 the pot fields show for the type Topf only", async () => {
    renderForm();
    expect(screen.queryByLabelText("Durchmesser (cm)")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Pot");
    expect(screen.getByLabelText("Durchmesser (cm)")).toBeTruthy();
    expect(screen.getByLabelText("Höhe (cm)")).toBeTruthy();
    expect(screen.getByLabelText("Material")).toBeTruthy();
    expect(screen.getByLabelText("Abfluss")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Sensor");
    expect(screen.queryByLabelText("Durchmesser (cm)")).toBeNull();
    expect(screen.queryByLabelText("Abfluss")).toBeNull();
  });

  it("US-BES-19 · P-08 a pot with nothing known sends its size and material as null and drainage Unbekannt as null", async () => {
    const onSend = renderForm();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Pot");
    await userEvent.type(screen.getByLabelText("Name"), "Blauer Topf");
    await save();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith({
      type: "Pot",
      name: "Blauer Topf",
      diameterCm: null,
      heightCm: null,
      material: null,
      drainage: null,
    });
  });

  it("US-BES-19 a pot sends its size with a decimal comma, its material and its drainage", async () => {
    const onSend = renderForm();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Pot");
    await userEvent.type(screen.getByLabelText("Name"), "Blauer Topf");
    await userEvent.type(screen.getByLabelText("Durchmesser (cm)"), "12,5");
    await userEvent.type(screen.getByLabelText("Höhe (cm)"), "20");
    await userEvent.type(screen.getByLabelText("Material"), "Terrakotta");
    await userEvent.selectOptions(screen.getByLabelText("Abfluss"), "yes");
    await save();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith({
      type: "Pot",
      name: "Blauer Topf",
      diameterCm: 12.5,
      heightCm: 20,
      material: "Terrakotta",
      drainage: true,
    });
  });

  it("US-BES-19 another type sends no pot field, even one typed before the type changed", async () => {
    const onSend = renderForm();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Pot");
    await userEvent.type(screen.getByLabelText("Durchmesser (cm)"), "0");
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Sensor");
    await userEvent.type(screen.getByLabelText("Name"), "Feuchtesensor");
    await save();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith({ type: "Sensor", name: "Feuchtesensor" });
  });

  it("US-BES-19 · P-03 a size outside 1 to 300 cm is refused in its field before anything is sent", async () => {
    const onSend = renderForm();
    await userEvent.selectOptions(screen.getByLabelText("Art"), "Pot");
    await userEvent.type(screen.getByLabelText("Name"), "Blauer Topf");
    await userEvent.type(screen.getByLabelText("Durchmesser (cm)"), "0");
    await save();
    expect(
      await screen.findByText(
        "Bitte gib eine Größe von 1 bis 300 cm an, höchstens mit einer Nachkommastelle.",
      ),
    ).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
  });
});

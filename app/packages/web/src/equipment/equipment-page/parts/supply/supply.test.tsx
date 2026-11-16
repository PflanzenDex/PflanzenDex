// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentRow } from "../../../equipment-api";
import { Supply } from "./supply";

const consumable = (extra: Partial<EquipmentRow> = {}): EquipmentRow => ({
  id: "c1",
  type: "Plant agent",
  name: "Neem",
  status: null,
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
  lightZoneId: null,
  powerW: null,
  luxStatement: null,
  inOperationSince: null,
  checkIntervalDays: null,
  lastCheckedOn: null,
  lifetimeValue: null,
  lifetimeSource: null,
  supply: "available",
  agentLink: null,
  assignedSpecimenId: null,
  assignedLocationId: null,
  diameterCm: null,
  heightCm: null,
  material: null,
  drainage: null,
  ...extra,
});

const actions = () => ({ busy: false, onSupply: vi.fn(), onLink: vi.fn() });

afterEach(cleanup);

describe("US-EQU-05 supply of a consumable", () => {
  it("US-EQU-05 marks the current level and sends the tapped one", async () => {
    const a = actions();
    render(<Supply item={consumable({ supply: "low" })} actions={a} />);
    expect(screen.getByRole("button", { name: "Wird knapp" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Leer" }));
    expect(a.onSupply).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), "empty");
  });

  it("US-QS-32 the three levels are one full-width row of equal columns, the shared segmented control", () => {
    render(<Supply item={consumable()} actions={actions()} />);
    const group = screen.getByRole("group", { name: "Vorrat von Neem" });
    expect(group.className).toContain("w-full");
    expect(group.className).toContain("auto-cols-fr");
    expect(group.querySelectorAll("button")).toHaveLength(3);
  });

  it("US-QS-32 the supply has a visible label Vorrat above its group", () => {
    const { container } = render(<Supply item={consumable()} actions={actions()} />);
    const label = screen.getByText("Vorrat", { exact: true });
    const group = screen.getByRole("group", { name: "Vorrat von Neem" });
    expect(label.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.contains(label)).toBe(true);
  });

  it("US-QS-32 the chosen level is the pressed one and no level is a filled primary button", () => {
    render(<Supply item={consumable({ supply: "empty" })} actions={actions()} />);
    expect(screen.getByRole("button", { name: "Leer" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Vorhanden" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    for (const name of ["Vorhanden", "Wird knapp", "Leer"])
      expect(screen.getByRole("button", { name }).className).not.toContain("bg-primary");
  });

  it("US-QS-32 while an action runs no level can be tapped (busy handling as before)", async () => {
    const a = { ...actions(), busy: true };
    render(<Supply item={consumable()} actions={a} />);
    expect(screen.getByRole("button", { name: "Vorhanden" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    for (const name of ["Vorhanden", "Wird knapp", "Leer"])
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: "Leer" }));
    expect(a.onSupply).not.toHaveBeenCalled();
  });

  it("US-EQU-05 tapping the current level sends nothing", async () => {
    const a = actions();
    render(<Supply item={consumable()} actions={a} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Vorhanden" }));
    expect(a.onSupply).not.toHaveBeenCalled();
  });

  it("US-EQU-05 a device shows no supply", () => {
    const { container } = render(
      <Supply
        item={consumable({ type: "Timer", status: "active", supply: null })}
        actions={actions()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("US-QS-32 the link note is one line at 14 px; the rest sits behind Mehr erfahren", async () => {
    render(<Supply item={consumable()} actions={actions()} />);
    const line = screen.getByText("Dein Behandlungstext bleibt, wie er ist.");
    expect(line.parentElement?.className).toContain("text-sm");
    expect(line.parentElement?.className).not.toContain("text-xs");
    expect(line.closest("details")?.querySelector("details")).not.toBeNull();
    const more = line.parentElement?.querySelector("details");
    expect(more?.textContent).toContain("Die Verknüpfung findet nur den Vorrat dazu.");
  });

  it("US-EQU-05 a plant agent can be linked, an empty text removes the link; other consumables cannot", async () => {
    const a = actions();
    const { rerender } = render(<Supply item={consumable()} actions={a} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Text in der Behandlung (optional)"), " Neemöl ");
    await user.click(screen.getByRole("button", { name: "Verknüpfung speichern" }));
    expect(a.onLink).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1" }), "Neemöl");
    rerender(<Supply item={consumable({ agentLink: "Neemöl" })} actions={a} />);
    await user.clear(screen.getByLabelText("Text in der Behandlung (optional)"));
    await user.click(screen.getByRole("button", { name: "Verknüpfung speichern" }));
    expect(a.onLink).toHaveBeenLastCalledWith(expect.objectContaining({ id: "c1" }), null);
    rerender(<Supply item={consumable({ type: "Substrate" })} actions={a} />);
    expect(screen.queryByLabelText("Text in der Behandlung (optional)")).toBeNull();
  });
});

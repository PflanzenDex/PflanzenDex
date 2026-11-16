// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentRow } from "../../../equipment-api";
import { Sharing } from "./sharing";

const item = { id: "e1", type: "Lamp", name: "Lampe Alpha" } as unknown as EquipmentRow;
afterEach(cleanup);

describe("US-QS-32 the privacy line of a shared device (SG-COPY-05, SG-TYPE-03)", () => {
  it("US-QS-32 one line at 14 px says what friends never see; the full list and the withdrawal sit behind Mehr erfahren", () => {
    render(<Sharing item={item} actions={{ busy: false, shared: new Map(), onShare: vi.fn() }} />);
    const line = screen.getByText("Freunde sehen nie den Preis.");
    expect(line.closest("details")).toBeNull();
    expect(line.parentElement?.className).toContain("text-sm");
    expect(line.parentElement?.className).not.toContain("text-xs");
    const more = line.parentElement?.querySelector("details");
    expect(more?.textContent).toContain("Kaufort, Seriennummer, Standort oder Kaufdatum");
    expect(more?.textContent).toContain("Zurückziehen wirkt beim nächsten Abruf");
    // The price is said once, in the visible line; the disclosure lists only the other hidden fields (US-QS-32).
    expect(more?.textContent).not.toMatch(/Preis|Lichtstufe/);
  });
});

describe("US-EQU-12 sharing control", () => {
  it("US-EQU-12 is private by default, names what friends never see and sends the choice with the note", async () => {
    const onShare = vi.fn();
    render(<Sharing item={item} actions={{ busy: false, shared: new Map(), onShare }} />);
    expect(screen.getByLabelText("Freigabe für Freunde")).toHaveProperty("value", "private");
    expect(screen.queryByLabelText(/Erfahrung für Freunde/)).toBeNull();
    expect(screen.getByText(/Kaufort, Seriennummer, Standort oder Kaufdatum/)).toBeTruthy();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Freigabe für Freunde"), "friends");
    await user.type(screen.getByLabelText(/Erfahrung für Freunde/), "  sehr hell ");
    await user.click(screen.getByRole("button", { name: "Freigabe speichern" }));
    expect(onShare).toHaveBeenCalledWith(item, "friends", "sehr hell");
  });

  it("US-EQU-12 a shared device shows its note and withdrawing sends private without a note", async () => {
    const onShare = vi.fn();
    render(
      <Sharing
        item={item}
        actions={{ busy: false, shared: new Map([["e1", "läuft ruhig"]]), onShare }}
      />,
    );
    expect(screen.getByLabelText(/Erfahrung für Freunde/)).toHaveProperty("value", "läuft ruhig");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Freigabe für Freunde"), "private");
    await user.click(screen.getByRole("button", { name: "Freigabe speichern" }));
    expect(onShare).toHaveBeenCalledWith(item, "private", null);
  });
});

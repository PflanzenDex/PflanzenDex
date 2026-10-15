// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentRow } from "../../equipment-api";
import { Sharing } from "./sharing";

const item = { id: "e1", type: "Lamp", name: "Lampe Alpha" } as unknown as EquipmentRow;
afterEach(cleanup);

describe("US-EQU-12 sharing control", () => {
  it("US-EQU-12 is private by default, names what friends never see and sends the choice with the note", async () => {
    const onShare = vi.fn();
    render(<Sharing item={item} actions={{ busy: false, shared: new Map(), onShare }} />);
    expect(screen.getByLabelText("Freigabe für Freunde")).toHaveProperty("value", "private");
    expect(screen.queryByLabelText(/Erfahrung für Freunde/)).toBeNull();
    expect(
      screen.getByText(/nie Preis, Kaufort, Seriennummer, Standort oder Kaufdatum/),
    ).toBeTruthy();
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

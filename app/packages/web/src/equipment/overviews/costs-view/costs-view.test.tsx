// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EquipmentRow } from "@pflanzendex/core";
import { CostsView } from "./costs-view";

let n = 0;
const item = (type: string, priceEur: number | null) =>
  ({ id: `e${++n}`, type, name: `Teil ${n}`, priceEur }) as unknown as EquipmentRow;

afterEach(cleanup);

describe("US-EQU-09 cost view", () => {
  it("US-EQU-09 shows the sum per type and in total and for how many records the price is missing", () => {
    render(<CostsView items={[item("Lamp", 49.9), item("Lamp", null), item("Timer", 12.5)]} />);
    const section = screen.getByRole("region", { name: "Kosten" });
    expect(section.textContent).toContain("62,40 €");
    expect(section.textContent).toContain("Summe über 2 von 3 Teilen Equipment");
    expect(section.textContent).toContain("Bei 1 Teil fehlt der Preis");
    const lamp = within(screen.getByRole("list", { name: "Kosten je Art" })).getAllByRole(
      "listitem",
    )[0] as HTMLElement;
    expect(lamp.textContent).toContain("49,90 €");
    expect(lamp.textContent).toContain("Preis bekannt bei 1 von 2");
  });

  it("US-EQU-09 reads unknown instead of 0 when no price is known and names what is not estimated", () => {
    render(<CostsView items={[item("Pot", null)]} />);
    const section = screen.getByRole("region", { name: "Kosten" });
    expect(section.textContent).toContain("unbekannt");
    expect(section.textContent).not.toContain("0,00");
    expect(section.textContent).toContain("Stromkosten und Ersatzkosten");
  });

  it("US-EQU-09 shows nothing without equipment", () => {
    render(<CostsView items={[]} />);
    expect(screen.queryByRole("region", { name: "Kosten" })).toBeNull();
  });
});

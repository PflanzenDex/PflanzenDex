// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EquipmentRow } from "../../../equipment-api";
import { Maintenance } from "./maintenance";

const device = (extra: Partial<EquipmentRow> = {}): EquipmentRow => ({
  id: "d1",
  type: "Timer",
  name: "Timer A",
  status: "active",
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
  supply: null,
  agentLink: null,
  assignedSpecimenId: null,
  assignedLocationId: null,
  diameterCm: null,
  heightCm: null,
  material: null,
  drainage: null,
  ...extra,
});

const actions = () => ({ busy: false, onSave: vi.fn(), onChecked: vi.fn() });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Freezes the clock (Date only) at the given instant, so "Zuletzt geprüft" is relative to a known day (US-QS-32). */
const clockAt = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

/** The value (dd) that follows a label (dt) in the operation list. */
const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe("US-EQU-04 operation and maintenance of a device", () => {
  it("US-EQU-04 shows missing values as unknown and no interval as not set (P-08)", () => {
    const { container } = render(<Maintenance item={device()} actions={actions()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("keins gesetzt");
    expect(text).toContain("noch nie");
    expect(text.match(/unbekannt/g)).toHaveLength(2);
  });

  it("US-EQU-04 shows the lifetime only as the manufacturer's statement with its source", () => {
    const item = device({ lifetimeValue: "50.000 Stunden", lifetimeSource: "Datenblatt" });
    const { container } = render(<Maintenance item={item} actions={actions()} />);
    expect(container.textContent).toContain(
      "50.000 Stunden (Herstellerangabe, Quelle: Datenblatt)",
    );
  });

  it("US-EQU-04 a consumable shows nothing of it", () => {
    const { container } = render(
      <Maintenance item={device({ type: "Substrate", status: null })} actions={actions()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("US-EQU-04 'Jetzt geprüft' sends today's date", async () => {
    const a = actions();
    render(<Maintenance item={device()} actions={a} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Jetzt geprüft: Timer A" }));
    expect(a.onChecked).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d1" }),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("US-EQU-04 saves the interval and since-date; empty fields are sent as unknown", async () => {
    const a = actions();
    render(<Maintenance item={device()} actions={a} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Prüfintervall (optional)" }), "90");
    await user.click(screen.getByRole("button", { name: "Betriebsdaten sichern" }));
    expect(a.onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }), {
      inOperationSince: null,
      checkIntervalDays: 90,
      lifetimeValue: null,
      lifetimeSource: null,
    });
  });

  it("US-EQU-04 refuses a lifetime without a source and a bad interval before sending", async () => {
    const a = actions();
    render(<Maintenance item={device()} actions={a} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Lebensdauer laut Hersteller (optional)"), "10 Jahre");
    await user.click(screen.getByRole("button", { name: "Betriebsdaten sichern" }));
    expect(await screen.findByText(/braucht ihre Quelle/)).toBeTruthy();
    await user.type(screen.getByLabelText("Quelle der Lebensdauer"), "Datenblatt");
    await user.type(screen.getByRole("textbox", { name: "Prüfintervall (optional)" }), "0");
    await user.click(screen.getByRole("button", { name: "Betriebsdaten sichern" }));
    expect(await screen.findByText(/von 1 bis 3650 Tagen/)).toBeTruthy();
    expect(a.onSave).not.toHaveBeenCalled();
  });
});

describe("US-QS-32 dates of a device in its operation list", () => {
  it("US-QS-32 'In Betrieb seit' shows the absolute date TT.MM.JJJJ, not the stored form", () => {
    clockAt("2026-11-15T12:00:00Z");
    render(<Maintenance item={device({ inOperationSince: "2026-09-13" })} actions={actions()} />);
    expect(valueOf("In Betrieb seit")).toBe("13.09.2026");
  });

  it("US-QS-32 'Zuletzt geprüft' reads 'heute' on the day it was checked", () => {
    clockAt("2026-11-15T12:00:00Z");
    render(<Maintenance item={device({ lastCheckedOn: "2026-11-15" })} actions={actions()} />);
    expect(valueOf("Zuletzt geprüft")).toBe("heute");
  });

  it("US-QS-32 'Zuletzt geprüft' reads 'vor 3 Tagen' within 7 days", () => {
    clockAt("2026-11-15T12:00:00Z");
    render(<Maintenance item={device({ lastCheckedOn: "2026-11-12" })} actions={actions()} />);
    expect(valueOf("Zuletzt geprüft")).toBe("vor 3\u00a0Tagen");
  });

  it("US-QS-32 'Zuletzt geprüft' from 8 days back shows TT.MM.JJJJ and 'noch nie' stays", () => {
    clockAt("2026-11-15T12:00:00Z");
    const { unmount } = render(
      <Maintenance item={device({ lastCheckedOn: "2026-11-07" })} actions={actions()} />,
    );
    expect(valueOf("Zuletzt geprüft")).toBe("07.11.2026");
    unmount();
    render(<Maintenance item={device()} actions={actions()} />);
    expect(valueOf("Zuletzt geprüft")).toBe("noch nie");
  });

  it("US-QS-32 after 'Jetzt geprüft' the line reads 'heute'", async () => {
    clockAt("2026-11-15T12:00:00Z");
    const a = actions();
    const { rerender } = render(<Maintenance item={device()} actions={a} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Jetzt geprüft: Timer A" }));
    expect(a.onChecked).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }), "2026-11-15");
    rerender(<Maintenance item={device({ lastCheckedOn: "2026-11-15" })} actions={a} />);
    expect(valueOf("Zuletzt geprüft")).toBe("heute");
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquipmentPage } from "./equipment-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const base = {
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
};
const ITEMS = [
  { ...base, id: "t1", type: "Timer", name: "Timer A", status: "active" },
  { ...base, id: "a1", type: "Plant agent", name: "Neem", status: null, supply: "available" },
  { ...base, id: "s1", type: "Sensor", name: "Feuchtesensor", status: "active" },
];
const SENSORS = {
  sensors: [{ id: "s1", name: "Feuchtesensor", status: "active", target: null }],
  specimens: [{ id: "p1", name: "Aloe" }],
  locations: [],
};

function fakeServer() {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") return response(200, ITEMS[0]);
    if (path === "/equipment/zones") return response(200, { zones: [], unassigned: [] });
    if (path === "/equipment/lamps") return response(200, { limit: null, lamps: [] });
    if (path === "/equipment/sensors") return response(200, SENSORS);
    if (path === "/equipment") return response(200, { equipment: ITEMS });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const lastPost = async (fetchFn: ReturnType<typeof fakeServer>) =>
  vi.waitFor(() => {
    const call = fetchFn.mock.calls.filter(([, init]) => init?.method === "POST").at(-1);
    if (!call) throw new Error("not sent yet");
    return { path: new URL(String(call[0])).pathname, body: JSON.parse(String(call[1]?.body)) };
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-EQU-04 US-EQU-05 US-EQU-06 upkeep writes from the equipment page", () => {
  it("US-EQU-04 'Jetzt geprüft' and the operation data are sent to the device", async () => {
    const fetchFn = fakeServer();
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Jetzt geprüft: Timer A" }));
    expect((await lastPost(fetchFn)).path).toBe("/equipment/t1/checked");
    const form = screen.getByRole("form", { name: "Betriebsdaten für Timer A" });
    await user.type(within(form).getByLabelText("Prüfintervall in Tagen (optional)"), "30");
    await user.click(within(form).getByRole("button", { name: "Betriebsdaten speichern" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/t1/maintenance",
      body: { checkIntervalDays: 30, inOperationSince: null },
    });
  });

  it("US-EQU-05 a tap sets the supply, the link text is saved and removable", async () => {
    const fetchFn = fakeServer();
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wird knapp" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/a1/supply",
      body: { supply: "low" },
    });
    await user.type(screen.getByLabelText("Text in der Behandlung (optional)"), "Neemöl");
    await user.click(screen.getByRole("button", { name: "Verknüpfung speichern" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/a1/agent-link",
      body: { agentLink: "Neemöl" },
    });
  });

  it("US-EQU-06 choosing a specimen for a sensor sends the assignment", async () => {
    const fetchFn = fakeServer();
    render(<EquipmentPage api="http://api" token={token} />);
    await userEvent
      .setup()
      .selectOptions(await screen.findByLabelText("Zuordnung von Feuchtesensor"), "specimen:p1");
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/s1/sensor-target",
      body: { specimenId: "p1", locationId: null },
    });
  });
});

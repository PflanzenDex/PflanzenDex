// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { Context } from "@/shared/platform/announcer/context";
import { EquipmentPage } from "./equipment-page";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. The toast provider is the app shell's (US-QS-07). */
const view = (ui: ReactElement, url = "/") =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </ToastProvider>,
  );

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

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
  diameterCm: null,
  heightCm: null,
  material: null,
  drainage: null,
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
    if (path === "/equipment/needs") return response(200, { needs: [] });
    if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
    if (path === "/equipment/wishes") return response(200, { open: [], bought: [], discarded: [] });
    if (path === "/equipment/sharing") return response(200, { shared: [] });
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
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-t1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Jetzt geprüft: Timer A" }));
    expect((await lastPost(fetchFn)).path).toBe("/equipment/t1/checked");
    const form = screen.getByRole("form", { name: "Betriebsdaten für Timer A" });
    await user.type(within(form).getByRole("textbox", { name: "Prüfintervall (optional)" }), "30");
    await user.click(within(form).getByRole("button", { name: "Betriebsdaten sichern" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/t1/maintenance",
      body: { checkIntervalDays: 30, inOperationSince: null },
    });
  });

  it("US-EQU-05 a tap sets the supply, the link text is saved and removable", async () => {
    const fetchFn = fakeServer();
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-a1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wird knapp" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/a1/supply",
      body: { supply: "low" },
    });
    await user.type(screen.getByLabelText("Text in der Behandlung (optional)"), "Neemöl");
    await user.click(screen.getByRole("button", { name: "Verknüpfung sichern" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/a1/agent-link",
      body: { agentLink: "Neemöl" },
    });
  });

  it("US-EQU-06 the Sensoren sheet with a sensor in it shows its heading once (SG-BASE-01, issue 2168)", async () => {
    fakeServer();
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=sensors");
    const layer = await screen.findByRole("dialog", { name: "Sensoren" });
    // The list is loaded once its assignment row is there; only then can its headings be counted.
    await within(layer).findByRole("button", {
      name: "Zugeordnet zu Nicht zugeordnet Feuchtesensor",
    });
    expect(within(layer).getAllByRole("heading", { name: "Sensoren" })).toHaveLength(1);
  });

  it("US-EQU-06 · US-QS-32 choosing a specimen for a sensor in its pick list sends the assignment", async () => {
    const fetchFn = fakeServer();
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=sensors");
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Zugeordnet zu Nicht zugeordnet Feuchtesensor" }),
    );
    await user.click(await screen.findByRole("button", { name: "Aloe" }));
    expect(await lastPost(fetchFn)).toMatchObject({
      path: "/equipment/s1/sensor-target",
      body: { specimenId: "p1", locationId: null },
    });
  });
  it("US-QS-32 · SG-FEED-02 a saved assignment is announced once: the write stays quiet and the row says the result", async () => {
    const fetchFn = fakeServer();
    const announce = vi.fn();
    render(
      <ToastProvider>
        <Context.Provider value={{ announce, buffer: vi.fn(), note: null }}>
          <MemoryRouter initialEntries={["/?sheet=sensors"]}>
            <EquipmentPage api="http://api" token={token} />
          </MemoryRouter>
        </Context.Provider>
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Zugeordnet zu Nicht zugeordnet Feuchtesensor" }),
    );
    await user.click(await screen.findByRole("button", { name: "Aloe" }));
    expect((await lastPost(fetchFn)).path).toBe("/equipment/s1/sensor-target");
    await vi.waitFor(() =>
      expect(announce).toHaveBeenCalledWith("Zuordnung von „Feuchtesensor“ gesichert."),
    );
    expect(announce).toHaveBeenCalledTimes(1);
  });
});

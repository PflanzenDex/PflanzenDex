// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquipmentPage } from "./equipment-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const item = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  type: "Lamp",
  name: "Lampe 3",
  status: "active",
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
  lightZoneId: null,
  ...extra,
});

const lampOf = (extra: Record<string, unknown> = {}) => ({
  id: "l1",
  name: "Lampe Regal",
  status: "active",
  ...extra,
});
const zone = (extra: Record<string, unknown> = {}) => ({
  zoneId: "z2",
  name: "Lampe 2",
  specimens: 3,
  lamps: [],
  note: null,
  ...extra,
});
const NO_ZONES = { zones: [], unassigned: [] };

function fakeServer(initial: unknown[], post?: () => Promise<Response>, zones: unknown = NO_ZONES) {
  let current = initial;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/equipment" && init?.method === "POST" && post) {
      const r = await post();
      if (r.ok) current = [item({ id: "e2", name: "Neue Lampe" })];
      return r;
    }
    if (path === "/equipment/zones") return response(200, zones);
    if (path === "/equipment") return response(200, { equipment: current });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-EQU-01 equipment page", () => {
  it("US-EQU-01 shows missing values as unknown, never guessed (P-08)", async () => {
    fakeServer([item()]);
    render(<EquipmentPage api="http://api" token={token} />);
    const card = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(within(card).getByRole("heading", { name: "Lampe 3" })).toBeTruthy();
    expect(card.textContent).toContain("Lampe · Aktiv");
    expect(card.textContent?.match(/unbekannt/g)).toHaveLength(4);
    expect(card.textContent).toContain("ohne Zone");
  });

  it("US-EQU-01 an empty list says what to do next", async () => {
    fakeServer([]);
    render(<EquipmentPage api="http://api" token={token} />);
    expect(await screen.findByText("Noch kein Equipment erfasst")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Equipment erfassen" })).toBeTruthy();
  });

  it("US-EQU-01 refuses an empty name and a URL as product id before sending", async () => {
    const fetchFn = fakeServer([]);
    render(<EquipmentPage api="http://api" token={token} />);
    await screen.findByText("Noch kein Equipment erfasst");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Lamp");
    await user.type(screen.getByLabelText("Produkt-ID (optional)"), "https://shop.example/x");
    await user.click(screen.getByRole("button", { name: "Equipment speichern" }));
    expect(await screen.findByText("Bitte gib einen Namen an.")).toBeTruthy();
    expect(screen.getByText(/Bitte keine URL/)).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("US-EQU-02 a lamp needs a light zone chosen from the list before anything is sent", async () => {
    const fetchFn = fakeServer([], undefined, { zones: [zone()], unassigned: [] });
    render(<EquipmentPage api="http://api" token={token} />);
    await screen.findByText("Noch kein Equipment erfasst");
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Lichtzone")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Art"), "Lamp");
    await user.type(screen.getByLabelText("Name"), "Neue Lampe");
    await user.click(screen.getByRole("button", { name: "Equipment speichern" }));
    expect(await screen.findByText(/Bitte wähle die Lichtzone/)).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.selectOptions(screen.getByLabelText("Lichtzone"), "z2");
    await user.click(screen.getByRole("button", { name: "Equipment speichern" }));
    const post = await vi.waitFor(() => {
      const call = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
      if (!call) throw new Error("not sent yet");
      return call;
    });
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ type: "Lamp", lightZoneId: "z2" });
  });

  it("US-EQU-02 shows the lamps per zone with the warning and its next action (P-10)", async () => {
    fakeServer([], undefined, {
      zones: [
        zone({
          note: {
            kind: "no_active_lamp",
            text: "Die Lichtzone Lampe 2 hat 3 Pflanzen, aber keine aktive Lampe.",
            nextAction: "Ordne dieser Zone eine aktive Lampe zu.",
          },
        }),
        zone({ zoneId: "z1", name: "Lampe 1", specimens: null, lamps: [lampOf()] }),
      ],
      unassigned: [lampOf({ id: "l2", name: "Alte Lampe" })],
    });
    render(<EquipmentPage api="http://api" token={token} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("keine aktive Lampe");
    expect(alert.textContent).toContain("Ordne dieser Zone eine aktive Lampe zu.");
    expect(screen.getByText("Pflanzenzahl unbekannt")).toBeTruthy();
    expect(screen.getByText(/noch keine Lichtzone/)).toBeTruthy();
    expect(screen.getByText("Alte Lampe")).toBeTruthy();
  });

  it("US-EQU-02 changing the state of a lamp sends it and reloads", async () => {
    const fetchFn = fakeServer([], undefined, {
      zones: [zone({ lamps: [lampOf()] })],
      unassigned: [],
    });
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/equipment/l1/status" && init?.method === "POST")
        return response(200, { ...item({ id: "l1" }), status: "defective" });
      if (path === "/equipment/zones")
        return response(200, { zones: [zone({ lamps: [lampOf()] })], unassigned: [] });
      return response(200, { equipment: [] });
    });
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Zustand"), "defective");
    const post = await vi.waitFor(() => {
      const call = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
      if (!call) throw new Error("not sent yet");
      return call;
    });
    expect(JSON.parse(String(post[1]?.body))).toEqual({ status: "defective" });
    expect(await screen.findByText(/Zustand von „Lampe Regal“ gespeichert/)).toBeTruthy();
  });

  it("US-EQU-01 sends only the given fields and reloads the list", async () => {
    const fetchFn = fakeServer([], () => response(201, { equipment: item({ id: "e2" }) }));
    render(<EquipmentPage api="http://api" token={token} />);
    await screen.findByText("Noch kein Equipment erfasst");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Timer");
    await user.type(screen.getByLabelText("Name"), "Neue Lampe");
    await user.type(screen.getByLabelText("Preis in Euro (optional)"), "49,90");
    await user.click(screen.getByRole("button", { name: "Equipment speichern" }));
    expect(await screen.findByText("Neue Lampe")).toBeTruthy();
    const post = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      type: "Timer",
      name: "Neue Lampe",
      priceEur: 49.9,
    });
  });

  it("US-EQU-01 shows the German text of a duplicate name at the name field", async () => {
    fakeServer([], () => response(409, { error: { code: "equipment.name_taken", message: "x" } }));
    render(<EquipmentPage api="http://api" token={token} />);
    await screen.findByText("Noch kein Equipment erfasst");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Timer");
    await user.type(screen.getByLabelText("Name"), "Lampe 3");
    await user.click(screen.getByRole("button", { name: "Equipment speichern" }));
    expect(await screen.findByText(/Dieses Equipment gibt es schon/)).toBeTruthy();
  });
});

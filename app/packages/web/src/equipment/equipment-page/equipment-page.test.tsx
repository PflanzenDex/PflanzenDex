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
  inOperationSince: null,
  checkIntervalDays: null,
  lastCheckedOn: null,
  lifetimeValue: null,
  lifetimeSource: null,
  supply: null,
  agentLink: null,
  assignedSpecimenId: null,
  assignedLocationId: null,
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
const NO_SENSORS = { sensors: [], specimens: [], locations: [] };
const NO_LIGHT = { limit: null, lamps: [] };
const lightOf = (extra: Record<string, unknown> = {}) => ({
  id: "l1",
  name: "Lampe Regal",
  status: "active",
  zone: { id: "z2", name: "Lampe 2", luxCeiling: 15000 },
  powerW: null,
  manufacturerLux: null,
  last: null,
  measurements: [],
  effective: { lux: 15000, basis: "zone" },
  check: null,
  ...extra,
});

function fakeServer(
  initial: unknown[],
  post?: () => Promise<Response>,
  zones: unknown = NO_ZONES,
  light: unknown = NO_LIGHT,
) {
  let current = initial;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/equipment" && init?.method === "POST" && post) {
      const r = await post();
      if (r.ok) current = [item({ id: "e2", name: "Neue Lampe" })];
      return r;
    }
    if (path === "/equipment/zones") return response(200, zones);
    if (path === "/equipment/lamps") return response(200, light);
    if (path === "/equipment/sensors") return response(200, NO_SENSORS);
    if (path === "/equipment/needs") return response(200, { needs: [] });
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
    // Four on the card, two more in "Betrieb und Wartung" (since when it runs, lifetime; US-EQU-04).
    expect(card.textContent?.match(/unbekannt/g)).toHaveLength(6);
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
      if (path === "/equipment/lamps") return response(200, NO_LIGHT);
      if (path === "/equipment/sensors") return response(200, NO_SENSORS);
      if (path === "/equipment/needs") return response(200, { needs: [] });
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

  it("US-EQU-03 a lamp without a measurement says not measured and shows the zone value", async () => {
    fakeServer([], undefined, NO_ZONES, { limit: null, lamps: [lightOf()] });
    render(<EquipmentPage api="http://api" token={token} />);
    const card = (await screen.findByRole("heading", { name: "Lampe Regal", level: 3 })).closest(
      "li",
    ) as HTMLElement;
    expect(card.textContent).toContain("nicht gemessen");
    expect(card.textContent).toContain("Wert der Zone, nicht gemessen");
    expect(card.textContent).toContain("15.000 lx");
    expect(card.textContent).toContain("Herstellerangabeunbekannt");
    expect(screen.getByText(/Noch keine Grenze festgelegt/)).toBeTruthy();
  });

  it("US-EQU-03 shows the measurement apart from the manufacturer's statement and warns with Check zone", async () => {
    fakeServer([], undefined, NO_ZONES, {
      limit: 20,
      lamps: [
        lightOf({
          manufacturerLux: 20000,
          powerW: 40,
          last: {
            id: "m1",
            equipmentId: "l1",
            measuredOn: "2026-10-01",
            lux: 6000,
            distanceCm: 30,
            method: "Luxmeter",
          },
          effective: { lux: 6000, basis: "measured" },
          check: {
            deviationPercent: 60,
            text: "Die letzte Messung weicht um 60 % ab.",
            nextAction: "Prüfe die Zone.",
          },
        }),
      ],
    });
    render(<EquipmentPage api="http://api" token={token} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Zone prüfen.");
    expect(alert.textContent).toContain("Prüfe die Zone.");
    const card = alert.closest("li") as HTMLElement;
    expect(card.textContent).toContain("20.000 lx");
    expect(card.textContent).toContain("6.000 lx am 2026-10-01 (Abstand 30 cm, Luxmeter)");
    expect(card.textContent).toContain("6.000 lx (gemessen)");
  });

  it("US-EQU-03 sends a measurement with the given fields only and refuses a missing lux value", async () => {
    const fetchFn = fakeServer([], undefined, NO_ZONES, { limit: null, lamps: [lightOf()] });
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") return response(201, { measurement: { id: "m1" } });
      if (path === "/equipment/lamps") return response(200, { limit: null, lamps: [lightOf()] });
      if (path === "/equipment/sensors") return response(200, NO_SENSORS);
      if (path === "/equipment/needs") return response(200, { needs: [] });
      if (path === "/equipment/zones") return response(200, NO_ZONES);
      return response(200, { equipment: [] });
    });
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Messung für Lampe Regal" });
    await user.click(within(form).getByRole("button", { name: "Messung speichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("Lux-Messung");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.type(within(form).getByLabelText("Lux"), "12000");
    await user.click(within(form).getByRole("button", { name: "Messung speichern" }));
    const post = await vi.waitFor(() => {
      const call = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
      if (!call) throw new Error("not sent yet");
      return call;
    });
    expect(String(post[0])).toContain("/equipment/l1/measurements");
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ lux: 12000 });
    expect(JSON.parse(String(post[1]?.body))).not.toHaveProperty("distanceCm");
  });

  it("US-EQU-03 saves the limit and refuses a value outside 1 to 100", async () => {
    const fetchFn = fakeServer([], undefined, NO_ZONES, { limit: null, lamps: [lightOf()] });
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Abweichungsgrenze" });
    await user.type(within(form).getByLabelText(/Abweichungsgrenze in Prozent/), "150");
    await user.click(within(form).getByRole("button", { name: "Grenze speichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("1 bis 100");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  const postsTo = (fetchFn: ReturnType<typeof fakeServer>) =>
    vi.waitFor(() => {
      const call = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
      if (!call) throw new Error("not sent yet");
      return call;
    });
  const answerAll = (fetchFn: ReturnType<typeof fakeServer>, zones: unknown, light: unknown) =>
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") return response(200, { ...item({ id: "l1" }), percent: 25 });
      if (path === "/equipment/lamps") return response(200, light);
      if (path === "/equipment/sensors") return response(200, NO_SENSORS);
      if (path === "/equipment/needs") return response(200, { needs: [] });
      if (path === "/equipment/zones") return response(200, zones);
      return response(200, { equipment: [] });
    });

  it("US-EQU-03 saves the manufacturer's statement and refuses text instead of numbers", async () => {
    const light = { limit: null, lamps: [lightOf()] };
    const fetchFn = fakeServer([], undefined, NO_ZONES, light);
    answerAll(fetchFn, NO_ZONES, light);
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Herstellerangabe ändern"));
    const form = screen.getByRole("form", { name: "Herstellerangabe für Lampe Regal" });
    await user.type(within(form).getByLabelText(/Leistung in Watt/), "abc");
    await user.click(within(form).getByRole("button", { name: "Herstellerangabe speichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("ganze Zahlen");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.clear(within(form).getByLabelText(/Leistung in Watt/));
    await user.type(within(form).getByLabelText(/Leistung in Watt/), "40");
    await user.type(within(form).getByLabelText(/Lichtstärke laut Hersteller/), "20000");
    await user.click(within(form).getByRole("button", { name: "Herstellerangabe speichern" }));
    const post = await postsTo(fetchFn);
    expect(String(post[0])).toContain("/equipment/l1/lamp-data");
    expect(JSON.parse(String(post[1]?.body))).toEqual({ powerW: 40, luxStatement: 20000 });
  });

  it("US-EQU-03 saves the limit and clears it with an empty field", async () => {
    const light = { limit: 25, lamps: [lightOf()] };
    const fetchFn = fakeServer([], undefined, NO_ZONES, light);
    answerAll(fetchFn, NO_ZONES, light);
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Abweichungsgrenze" });
    expect(form.textContent).toContain("mehr als 25 %");
    await user.clear(within(form).getByLabelText(/Abweichungsgrenze in Prozent/));
    await user.click(within(form).getByRole("button", { name: "Grenze speichern" }));
    const post = await postsTo(fetchFn);
    expect(String(post[0])).toContain("/equipment/lamps/limit");
    expect(JSON.parse(String(post[1]?.body))).toEqual({ percent: null });
    expect(await screen.findByText("Die Prüfung ist aus.")).toBeTruthy();
  });

  it("US-EQU-03 lists the whole log of a lamp and refuses a distance that is no number", async () => {
    const m = (id: string, measuredOn: string, luxValue: number) => ({
      id,
      equipmentId: "l1",
      measuredOn,
      lux: luxValue,
      distanceCm: null,
      method: null,
    });
    const light = {
      limit: null,
      lamps: [
        lightOf({
          last: m("a", "2026-10-05", 9000),
          measurements: [m("a", "2026-10-05", 9000), m("b", "2026-10-01", 12000)],
          effective: { lux: 9000, basis: "measured" },
        }),
      ],
    };
    fakeServer([], undefined, NO_ZONES, light);
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Alle Messungen (2)"));
    expect(screen.getByText("2026-10-01: 12.000 lx")).toBeTruthy();
    const form = screen.getByRole("form", { name: "Messung für Lampe Regal" });
    await user.type(within(form).getByLabelText("Lux"), "500");
    await user.type(within(form).getByLabelText(/Abstand in cm/), "x");
    await user.click(within(form).getByRole("button", { name: "Messung speichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("Abstand");
  });

  it("US-EQU-02 moving a lamp to another zone sends the zone", async () => {
    const zones = {
      zones: [
        zone({ lamps: [lampOf()] }),
        zone({ zoneId: "z3", name: "Lampe 3", specimens: 1, lamps: [] }),
      ],
      unassigned: [],
    };
    const fetchFn = fakeServer([], undefined, zones);
    answerAll(fetchFn, zones, NO_LIGHT);
    render(<EquipmentPage api="http://api" token={token} />);
    const user = userEvent.setup();
    const list = await screen.findByRole("list", { name: "Lampen in Lampe 2" });
    await user.selectOptions(within(list).getByLabelText("Lichtzone"), "z3");
    const post = await postsTo(fetchFn);
    expect(String(post[0])).toContain("/equipment/l1/zone");
    expect(JSON.parse(String(post[1]?.body))).toEqual({ lightZoneId: "z3" });
  });
});

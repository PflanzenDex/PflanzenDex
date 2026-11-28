// @vitest-environment jsdom
import { StrictMode, type ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { plain } from "@/shared/testing/plain-text";
import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { EquipmentPage } from "./equipment-page";
import { EquipmentPageSkeleton } from "./equipment-page.skeleton";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. */
// The toast of an undo needs the provider of the app shell above the page (US-QS-07). The page sits in the frame of
// the collection area (US-QS-15), so a layer opens in its pane.
const view = (ui: ReactElement, url = "/") =>
  render(
    <ToastProvider>
      <AnnouncerProvider>
        <MemoryRouter initialEntries={[url]}>
          <LayerHost>{ui}</LayerHost>
        </MemoryRouter>
      </AnnouncerProvider>
    </ToastProvider>,
  );

/** What the shared live region says (DS-69); the toast regions beside it are no part of it. */
const said = () => document.querySelector(".sr-only[aria-live=polite]")?.textContent?.trim() ?? "";

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const item = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  type: "Lamp",
  name: "Zone 3",
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
  diameterCm: null,
  heightCm: null,
  material: null,
  drainage: null,
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
  name: "Zone 2",
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
  zone: { id: "z2", name: "Zone 2", luxCeiling: 15000 },
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
    if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
    if (path === "/equipment/wishes") return response(200, { open: [], bought: [], discarded: [] });
    if (path === "/equipment/sharing") return response(200, { shared: [] });
    if (path === "/equipment") return response(200, { equipment: current });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

describe("US-EQU-01 equipment page", () => {
  it("US-EQU-01 shows missing values as unknown, never guessed (P-08)", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-e1");
    const card = await screen.findByRole("dialog", { name: "Zone 3" });
    expect(card.textContent).toContain("Lampe · Aktiv");
    // Unknown values fold into one line; two more in "Betrieb und Wartung" (since when it runs, lifetime; US-EQU-04).
    expect(card.textContent).toContain(
      "Noch unbekannt: Hersteller und Modell, Produkt-ID, Preis, Gekauft am",
    );
    expect(card.textContent?.match(/unbekannt/g)).toHaveLength(3);
    expect(card.textContent).toContain("Lichtzone fehlt");
  });

  it("US-QS-32 'Gekauft am' shows the date as TT.MM.JJJJ, never the stored form", async () => {
    fakeServer([item({ boughtAt: "2026-10-03" })]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-e1");
    const card = await screen.findByRole("dialog", { name: "Zone 3" });
    const value = within(card).getByText("03.10.2026");
    expect(value.tagName).toBe("DD");
    expect(value.previousElementSibling?.textContent).toBe("Gekauft am");
    expect(card.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("US-EQU-01 an empty list says what to do next", async () => {
    fakeServer([]);
    view(<EquipmentPage api="http://api" token={token} />);
    expect(await screen.findByText(/Noch kein Gerät erfasst/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gerät erfassen" })).toBeTruthy();
  });

  it("US-EQU-01 refuses an empty name and a URL as product id before sending", async () => {
    const fetchFn = fakeServer([]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=new");
    await screen.findByLabelText("Art");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Lamp");
    await user.type(screen.getByLabelText("Produkt-ID (optional)"), "https://shop.example/x");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
    expect(await screen.findByText("Gib einen Namen ein.")).toBeTruthy();
    expect(screen.getByText(/Gib keine URL ein/)).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("US-EQU-02 a lamp needs a light zone chosen from the list before anything is sent", async () => {
    const fetchFn = fakeServer([], undefined, { zones: [zone()], unassigned: [] });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=new");
    await screen.findByLabelText("Art");
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Lichtzone")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Art"), "Lamp");
    await user.type(screen.getByLabelText("Name"), "Neue Lampe");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
    expect(await screen.findByText(/Wähle die Lichtzone/)).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.selectOptions(screen.getByLabelText("Lichtzone"), "z2");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
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
            text: "Die Lichtzone Zone 2 hat 3 Pflanzen, aber keine aktive Lampe.",
            nextAction: "Ordne dieser Zone eine aktive Lampe zu.",
          },
        }),
        zone({
          zoneId: "z1",
          name: "Zone 1 · Stecklingslicht",
          specimens: null,
          lamps: [lampOf()],
        }),
      ],
      unassigned: [lampOf({ id: "l2", name: "Alte Lampe" })],
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("keine aktive Lampe");
    expect(alert.textContent).toContain("Ordne dieser Zone eine aktive Lampe zu.");
    expect(screen.getByText(/Pflanzenzahl unbekannt/)).toBeTruthy();
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
      if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
      if (path === "/equipment/wishes")
        return response(200, { open: [], bought: [], discarded: [] });
      if (path === "/equipment/sharing") return response(200, { shared: [] });
      return response(200, { equipment: [] });
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Zustand"), "defective");
    const post = await vi.waitFor(() => {
      const call = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
      if (!call) throw new Error("not sent yet");
      return call;
    });
    expect(JSON.parse(String(post[1]?.body))).toEqual({ status: "defective" });
    // The undo toast stays (US-EQU-02); the box of the layer is gone (SG-FEED-02, F-0160).
    expect(await screen.findByText(/Zustand von „Lampe Regal“ ist jetzt „Defekt“/)).toBeTruthy();
    expect(screen.queryByText(/gesichert/)).toBeNull();
  });

  it("US-EQU-01 sends only the given fields and reloads the list", async () => {
    const fetchFn = fakeServer([], () => response(201, { equipment: item({ id: "e2" }) }));
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=new");
    await screen.findByLabelText("Art");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Timer");
    await user.type(screen.getByLabelText("Name"), "Neue Lampe");
    await user.type(screen.getByLabelText("Preis (optional)"), "49,90");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
    // The layer closes, the outcome stands on the screen and the tile counts the new record (US-QS-22).
    expect(await screen.findByText(/Gerät „Neue Lampe“ gesichert/)).toBeTruthy();
    // The count is in the tile twice, one copy per width (equipment-tiles.tsx).
    expect(await screen.findAllByText("1 Gerät")).toHaveLength(2);
    const post = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      type: "Timer",
      name: "Neue Lampe",
      priceEur: 49.9,
    });
  });

  it("US-EQU-01 shows the German text of a duplicate name at the name field", async () => {
    fakeServer([], () => response(409, { error: { code: "equipment.name_taken", message: "x" } }));
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=new");
    await screen.findByLabelText("Art");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Timer");
    await user.type(screen.getByLabelText("Name"), "Zone 3");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
    expect(await screen.findByText(/Dieses Gerät gibt es schon/)).toBeTruthy();
  });

  it("US-EQU-01 · FR-QG-11 an unreachable server shows the app's network text in the form, not the generic error text", async () => {
    fakeServer([], () => Promise.reject(new TypeError("Failed to fetch")));
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=new");
    await screen.findByLabelText("Art");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Art"), "Timer");
    await user.type(screen.getByLabelText("Name"), "Neue Lampe");
    await user.click(screen.getByRole("button", { name: "Gerät sichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Der Server ist gerade nicht erreichbar");
    expect(alert.textContent).not.toContain("Es ist ein Fehler aufgetreten");
  });

  it("US-EQU-03 a lamp without a measurement says not measured and shows the zone value", async () => {
    fakeServer([], undefined, NO_ZONES, { limit: null, lamps: [lightOf()] });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const card = (await screen.findByText("Lampe Regal")).closest("details") as HTMLElement;
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
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Zone prüfen.");
    expect(alert.textContent).toContain("Prüfe die Zone.");
    const card = alert.closest("li") as HTMLElement;
    expect(card.textContent).toContain("20.000 lx");
    expect(card.textContent).toContain("6.000 lx am 2026-10-01 (Abstand 30\u00a0cm, Luxmeter)");
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
      if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
      if (path === "/equipment/wishes")
        return response(200, { open: [], bought: [], discarded: [] });
      if (path === "/equipment/sharing") return response(200, { shared: [] });
      if (path === "/equipment/zones") return response(200, NO_ZONES);
      return response(200, { equipment: [] });
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Messung für Lampe Regal" });
    await user.click(within(form).getByRole("button", { name: "Messung sichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("Lux-Messung");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.type(within(form).getByRole("textbox", { name: "Lichtstärke" }), "12000");
    await user.click(within(form).getByRole("button", { name: "Messung sichern" }));
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
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Abweichungsgrenze" });
    await user.type(within(form).getByLabelText(/^Abweichungsgrenze \(optional\)/), "150");
    await user.click(within(form).getByRole("button", { name: "Grenze sichern" }));
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
      if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
      if (path === "/equipment/wishes")
        return response(200, { open: [], bought: [], discarded: [] });
      if (path === "/equipment/sharing") return response(200, { shared: [] });
      if (path === "/equipment/zones") return response(200, zones);
      return response(200, { equipment: [] });
    });

  it("US-EQU-03 saves the manufacturer's statement and refuses text instead of numbers", async () => {
    const light = { limit: null, lamps: [lightOf()] };
    const fetchFn = fakeServer([], undefined, NO_ZONES, light);
    answerAll(fetchFn, NO_ZONES, light);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Herstellerangabe ändern"));
    const form = screen.getByRole("form", { name: "Herstellerangabe für Lampe Regal" });
    await user.type(within(form).getByLabelText(/^Leistung \(optional\)/), "abc");
    await user.click(within(form).getByRole("button", { name: "Herstellerangabe sichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("ganze Zahlen");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.clear(within(form).getByLabelText(/^Leistung \(optional\)/));
    await user.type(within(form).getByLabelText(/^Leistung \(optional\)/), "40");
    await user.type(within(form).getByLabelText(/Lichtstärke laut Hersteller/), "20000");
    await user.click(within(form).getByRole("button", { name: "Herstellerangabe sichern" }));
    const post = await postsTo(fetchFn);
    expect(String(post[0])).toContain("/equipment/l1/lamp-data");
    expect(JSON.parse(String(post[1]?.body))).toEqual({ powerW: 40, luxStatement: 20000 });
  });

  it("US-EQU-03 saves the limit and clears it with an empty field", async () => {
    const light = { limit: 25, lamps: [lightOf()] };
    const fetchFn = fakeServer([], undefined, NO_ZONES, light);
    answerAll(fetchFn, NO_ZONES, light);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    const form = await screen.findByRole("form", { name: "Abweichungsgrenze" });
    expect(form.textContent).toContain("mehr als 25 %");
    await user.clear(within(form).getByLabelText(/^Abweichungsgrenze \(optional\)/));
    await user.click(within(form).getByRole("button", { name: "Grenze sichern" }));
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
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Alle Messungen (2)"));
    expect(screen.getByText("2026-10-01: 12.000 lx")).toBeTruthy();
    const form = screen.getByRole("form", { name: "Messung für Lampe Regal" });
    await user.type(within(form).getByRole("textbox", { name: "Lichtstärke" }), "500");
    await user.type(within(form).getByLabelText(/^Abstand \(optional\)/), "x");
    await user.click(within(form).getByRole("button", { name: "Messung sichern" }));
    expect(within(form).getByRole("alert").textContent).toContain("Abstand");
  });

  it("US-EQU-02 moving a lamp to another zone sends the zone", async () => {
    const zones = {
      zones: [
        zone({ lamps: [lampOf()] }),
        zone({ zoneId: "z3", name: "Zone 3", specimens: 1, lamps: [] }),
      ],
      unassigned: [],
    };
    const fetchFn = fakeServer([], undefined, zones);
    answerAll(fetchFn, zones, NO_LIGHT);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    const list = await screen.findByRole("list", { name: "Lampen in Zone 2" });
    await user.selectOptions(within(list).getByLabelText("Lichtzone"), "z3");
    const post = await postsTo(fetchFn);
    expect(String(post[0])).toContain("/equipment/l1/zone");
    expect(JSON.parse(String(post[1]?.body))).toEqual({ lightZoneId: "z3" });
  });
});

describe("US-EQU-10 recommendations on the equipment page", () => {
  it("US-EQU-10 shows the block with its empty state while the switch is on", async () => {
    fakeServer([]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=needs");
    expect(
      await screen.findByRole("heading", { name: "Empfehlungen zu deinem Bedarf" }),
    ).toBeTruthy();
  });

  it("US-EQU-10 hides the block and does not ask the API while the switch is off", async () => {
    const fetchFn = fakeServer([]);
    view(
      <FeaturesProvider features={{ recommendations: false }}>
        <EquipmentPage api="http://api" token={token} />
      </FeaturesProvider>,
      "/?sheet=needs",
    );
    await screen.findByRole("dialog", { name: "Bedarf" });
    expect(screen.queryByRole("heading", { name: "Empfehlungen zu deinem Bedarf" })).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/equipment/recommendations"))).toBe(
      false,
    );
  });
});

describe("US-QS-22 the equipment fits one screen", () => {
  it("US-QS-22 the parts are tiles with their counts, the costs read unbekannt without a price (P-08)", async () => {
    fakeServer([item(), item({ id: "e2", name: "Timer A", type: "Timer" })]);
    view(<EquipmentPage api="http://api" token={token} />);
    const tile = async (name: string) =>
      (
        await screen.findByRole("button", {
          name: (accessible) =>
            accessible.startsWith(name) &&
            !accessible.startsWith(`${name}-`) &&
            !accessible.endsWith("erfassen"),
        })
      ).textContent;
    expect(await tile("Geräte")).toContain("2\u00a0Geräte");
    expect(await tile("Kosten")).toContain("unbekannt");
    expect(await tile("Bedarf")).toContain("nichts fehlt");
    expect(await tile("Sensoren")).toContain("0\u00a0Sensoren");
    expect(await tile("Geräte-Wünsche")).toContain("0\u00a0offene Wünsche");
  });

  it("US-QS-22 'Gerät erfassen' is the one primary action and opens the form as a layer", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gerät erfassen" }));
    const layer = await screen.findByRole("dialog", { name: "Neues Gerät" });
    expect(within(layer).getByLabelText("Art")).toBeTruthy();
    // The optional fields sit behind "Mehr Angaben" (US-QS-22).
    const more = within(layer).getByText("Mehr Angaben").closest("details") as HTMLElement;
    expect(more.contains(within(layer).getByLabelText("Preis (optional)"))).toBe(true);
    expect(more.contains(within(layer).getByLabelText("Name"))).toBe(false);
    // The save sits in the bar of the layer with Abbrechen before it, not in a sticky footer (US-QS-32, SG-SHEET-04, issue 1941).
    const save = within(layer).getByRole("button", { name: "Gerät sichern" });
    const cancel = within(layer).getByRole("button", { name: "Abbrechen" });
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(cancel.parentElement).toBe(save.parentElement);
    expect(layer.querySelector("[class*='bottom-0']")).toBeNull();
  });

  it("US-QS-24 'Neues Gerät' starts with Mehr Angaben closed, has no heading inside the form that repeats the layer title, and saves from the bar, not a sticky footer", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gerät erfassen" }));
    const layer = await screen.findByRole("dialog", { name: "Neues Gerät" });
    const section = within(layer).getByRole("region", { name: "Gerät erfassen" });
    expect(within(section).queryByRole("heading")).toBeNull();
    const more = within(layer).getByText("Mehr Angaben").closest("details") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(layer.querySelector("[class*='sticky'][class*='bottom-0']")).toBeNull();
    expect(within(layer).getByRole("button", { name: "Gerät sichern" })).toBeTruthy();
  });

  it("US-QS-22 a tile opens its layer with the existing content; the layers mount only while open", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />);
    await screen.findByRole("button", { name: /^Kosten/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Zone 3")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Geräte 1\u00a0Gerät/ }));
    const layer = await screen.findByRole("dialog", { name: "Geräte" });
    expect(within(layer).getByRole("button", { name: /Zone 3/ })).toBeTruthy();
  });

  it("US-QS-15 · US-QS-22 the list of what I own is one scroll list inside its layer: every entry, no pages, no address part", async () => {
    setViewportWidth(768);
    fakeServer([
      item({ id: "e1", name: "Zone 1 · Stecklingslicht" }),
      item({ id: "e2", name: "Zone 2" }),
      item({ id: "e3", name: "Zone 3" }),
      ...[4, 5, 6, 7].map((n) => item({ id: `e${n}`, name: `Teil ${n}` })),
    ]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    const layer = await screen.findByRole("dialog", { name: "Geräte" });
    expect(await within(layer).findByRole("button", { name: /Teil 7/ })).toBeTruthy();
    expect(within(layer).queryByText(/Seite \d+ von \d+/)).toBeNull();
    expect(within(layer).queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("US-QS-22 a row of the list opens the record as its own layer", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    await userEvent.click(await screen.findByRole("button", { name: /Zone 3/ }));
    const layer = await screen.findByRole("dialog", { name: "Zone 3" });
    expect(within(layer).getByText(/Noch unbekannt: Hersteller und Modell/)).toBeTruthy();
  });

  it("US-QS-32 · SG-COLOR-04 a defective device shows an amber 'Defekt' badge beside its name; an active one shows no 'Aktiv'; 'Ausgemustert' leads the meta line, with no badge", async () => {
    fakeServer([
      item({ id: "e1", name: "Lampe defekt", status: "defective" }),
      item({ id: "e2", name: "Lampe aktiv", status: "active" }),
      item({ id: "e3", name: "Lampe alt", status: "retired" }),
    ]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    const defective = await screen.findByRole("button", { name: /Lampe defekt/ });
    expect(within(defective).getByText("Defekt").className.split(" ")).toContain("bg-warning");
    const active = screen.getByRole("button", { name: /Lampe aktiv/ });
    expect(active.textContent).not.toContain("Aktiv");
    expect(active.textContent).not.toContain("Defekt");
    const retired = screen.getByRole("button", { name: /Lampe alt/ });
    // The retirement is plain muted text at the head of the meta line, so the row has no trailing badge at all.
    expect(plain(retired.querySelector("[data-row-meta]")?.textContent)).toBe(
      "Ausgemustert · Lampe · Lichtzone fehlt",
    );
    expect(within(retired).queryByText("Ausgemustert")).toBeNull();
    expect(retired.querySelector(".bg-warning")).toBeNull();
    expect(retired.textContent).toMatch(/Lichtzone fehlt$/);
  });

  it("US-QS-32 · P-10 'Ausgemustert' leads the meta line as plain muted text; no trailing badge is left to squeeze the name", async () => {
    fakeServer([item({ id: "e3", name: "Lampe alt", status: "retired" })]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    const row = await screen.findByRole("button", { name: /Lampe alt/ });
    const meta = row.querySelector("[data-row-meta]") as HTMLElement;
    expect(plain(meta.textContent)).toBe("Ausgemustert · Lampe · Lichtzone fehlt");
    expect(meta.className.split(" ")).toEqual(
      expect.arrayContaining(["[overflow-wrap:break-word]", "text-muted-foreground"]),
    );
    expect(meta.className.split(" ")).not.toContain("truncate");
    expect(meta.className.split(" ")).not.toContain("max-w-[60%]");
    expect(meta.parentElement?.className.split(" ")).not.toContain("max-w-[60%]");
    // Only the name and the meta line are in the row's text: nothing trails them but the chevron.
    expect(plain(row.textContent)).toBe("Lampe alt Ausgemustert · Lampe · Lichtzone fehlt");
    expect(row.querySelectorAll("svg")).toHaveLength(2);
  });

  it.each([360, 1440])(
    "US-QS-15 · US-QS-22 at %i px, Escape closes an item and the focus returns to the row it was opened from (WCAG 2.4.3)",
    async (width) => {
      setViewportWidth(width);
      try {
        fakeServer([item(), item({ id: "e2", name: "Timer A", type: "Timer" })]);
        // StrictMode runs the mount effects twice in development, as the app does (issue 1363).
        view(
          <StrictMode>
            <EquipmentPage api="http://api" token={token} />
          </StrictMode>,
        );
        await userEvent.click(await screen.findByRole("button", { name: /^Geräte 2\u00a0Geräte/ }));
        await userEvent.click(await screen.findByRole("button", { name: /Zone 3/ }));
        await screen.findByRole("heading", { name: "Zone 3" });
        await userEvent.keyboard("{Escape}");
        // The list layer mounts again with new rows: the row of the item is the one that must hold the focus.
        const row = await screen.findByRole("button", { name: /Zone 3/ });
        await waitFor(() => expect(document.activeElement).toBe(row));
        // Radix restores its own focus after a timer; the row keeps it.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(document.activeElement).toBe(row);
      } finally {
        // The later tests of this file expect the default phone viewport of the test setup.
        setViewportWidth(360);
      }
    },
  );

  it("US-QS-22 · P-09 a part without records says so and names the next step", async () => {
    fakeServer([]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=sensors");
    const layer = await screen.findByRole("dialog", { name: "Sensoren" });
    expect(within(layer).getByText(/Noch kein Sensor erfasst/)).toBeTruthy();
    expect(within(layer).getByText(/Gerät erfassen/)).toBeTruthy();
  });

  it("US-QS-32 · F-0160 · SG-FEED-02 a write is announced once and boxed nowhere: not in its layer, not on the page behind", async () => {
    const fetchFn = fakeServer([], undefined, {
      zones: [zone({ lamps: [lampOf()] }), zone({ zoneId: "z3", name: "Zone 3", lamps: [] })],
      unassigned: [],
    });
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/equipment/l1/zone"
        ? response(200, item({ id: "l1" }))
        : (base?.(url, init) ?? response(404, {})),
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const layer = await screen.findByRole("dialog", { name: "Lampen und Zonen" });
    await userEvent.selectOptions(await within(layer).findByLabelText("Lichtzone"), "z3");
    await vi.waitFor(() => expect(said()).toBe("Lampe „Lampe Regal“ umgezogen."));
    expect(within(layer).queryByRole("status")).toBeNull();
    fireEvent.keyDown(layer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The text stands in the live region only: no element of the page repeats it.
    expect(screen.queryAllByText(/umgezogen/).filter((e) => !e.hasAttribute("aria-live"))).toEqual(
      [],
    );
    expect(document.querySelector("[role=status]")).toBeNull();
  });

  it("US-QS-32 · F-0160 · P-10 a refusal shows in the layer where it happened, and is gone when that layer closes and another opens", async () => {
    const fetchFn = fakeServer([], undefined, {
      zones: [zone({ lamps: [lampOf()] }), zone({ zoneId: "z3", name: "Zone 3", lamps: [] })],
      unassigned: [],
    });
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/equipment/l1/zone"
        ? response(404, { error: { code: "equipment.not_found", text: "raw" } })
        : (base?.(url, init) ?? response(404, {})),
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const lamps = await screen.findByRole("dialog", { name: "Lampen und Zonen" });
    await userEvent.selectOptions(await within(lamps).findByLabelText("Lichtzone"), "z3");
    expect(await within(lamps).findByRole("alert")).toBeTruthy();
    fireEvent.keyDown(lamps, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /^(Wünsche|Geräte-Wünsche)/ }));
    const wishes = await screen.findByRole("dialog", { name: "Geräte-Wünsche" });
    expect(within(wishes).queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 · F-0160 an assigned sensor says 'Zugeordnet: <Pflanze>' at its row, the live region says it once, and no later sheet repeats it", async () => {
    const sensors = {
      sensors: [{ id: "s1", name: "Bodenfeuchte-Sensor", status: "active", target: null }],
      specimens: [{ id: "p1", name: "Gummibaum – Wohnzimmer Fenster" }],
      locations: [],
    };
    const fetchFn = fakeServer([]);
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/equipment/sensors") return response(200, sensors);
      if (path === "/equipment/s1/sensor-target") return response(200, item({ id: "s1" }));
      return base?.(url, init) ?? response(404, {});
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=sensors");
    const layer = await screen.findByRole("dialog", { name: "Sensoren" });
    await userEvent.click(
      await within(layer).findByRole("button", {
        name: "Zugeordnet zu Nicht zugeordnet Bodenfeuchte-Sensor",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Gummibaum – Wohnzimmer Fenster" }),
    );
    expect(
      await within(layer).findByText("Zugeordnet: Gummibaum – Wohnzimmer Fenster"),
    ).toBeTruthy();
    // The row offers its undo; the live region says the result once (SG-FEED-02, SG-FEED-03).
    expect(await within(layer).findByRole("button", { name: /^Rückgängig/ })).toBeTruthy();
    await vi.waitFor(() => expect(said()).toBe("Zuordnung von „Bodenfeuchte-Sensor“ gesichert."));
    fireEvent.keyDown(layer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(await screen.findByRole("button", { name: /^Geräte-Wünsche/ }));
    const wishes = await screen.findByRole("dialog", { name: "Geräte-Wünsche" });
    expect(within(wishes).queryByText(/Zuordnung|Zugeordnet/)).toBeNull();
  });

  it("US-QS-32 · F-0160 · P-10 a refusal is gone for good when its layer closes: opening the same layer again does not bring it back", async () => {
    const fetchFn = fakeServer([], undefined, {
      zones: [zone({ lamps: [lampOf()] }), zone({ zoneId: "z3", name: "Zone 3", lamps: [] })],
      unassigned: [],
    });
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/equipment/l1/zone"
        ? response(404, { error: { code: "equipment.not_found", text: "raw" } })
        : (base?.(url, init) ?? response(404, {})),
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const lamps = await screen.findByRole("dialog", { name: "Lampen und Zonen" });
    await userEvent.selectOptions(await within(lamps).findByLabelText("Lichtzone"), "z3");
    expect(await within(lamps).findByRole("alert")).toBeTruthy();
    fireEvent.keyDown(lamps, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(await screen.findByRole("button", { name: /^Lampen/ }));
    const again = await screen.findByRole("dialog", { name: "Lampen und Zonen" });
    expect(within(again).queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 · F-0160 · P-10 the same refusal object twice (the network is down) shows again in the next layer: a new refusal is told by its count, not by its object", async () => {
    const sensors = {
      sensors: [{ id: "s1", name: "Bodenfeuchte-Sensor", status: "active", target: null }],
      specimens: [{ id: "p1", name: "Aloe" }],
      locations: [],
    };
    const zones = {
      zones: [zone({ lamps: [lampOf()] }), zone({ zoneId: "z3", name: "Zone 3", lamps: [] })],
      unassigned: [],
    };
    const fetchFn = fakeServer([], undefined, zones);
    const base = fetchFn.getMockImplementation();
    // A write that cannot reach the server answers with one shared error object (`NETWORK_ERROR`).
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST") throw new TypeError("Failed to fetch");
      return path === "/equipment/sensors"
        ? response(200, sensors)
        : (base?.(url, init) ?? response(404, {}));
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const lamps = await screen.findByRole("dialog", { name: "Lampen und Zonen" });
    await userEvent.selectOptions(await within(lamps).findByLabelText("Lichtzone"), "z3");
    expect(await within(lamps).findByRole("alert")).toBeTruthy();
    fireEvent.keyDown(lamps, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: /^Sensoren/ }));
    const layer = await screen.findByRole("dialog", { name: "Sensoren" });
    await userEvent.click(
      await within(layer).findByRole("button", {
        name: "Zugeordnet zu Nicht zugeordnet Bodenfeuchte-Sensor",
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Aloe" }));
    expect(await within(layer).findByRole("alert")).toBeTruthy();
  });

  it("US-EQU-02 equipment status change offers Rückgängig which restores the previous status (P-10)", async () => {
    const fetchFn = fakeServer([], undefined, {
      zones: [zone({ lamps: [lampOf()] })],
      unassigned: [],
    });
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/equipment/l1/status" && init?.method === "POST")
        return response(200, {
          ...item({ id: "l1" }),
          status: JSON.parse(String(init.body)).status,
        });
      return base?.(url, init) ?? response(404, {});
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Zustand"), "defective");
    // jsdom has no CSS: the toast sits beside the modal, whose body has pointer-events none; in the browser the toast is
    // pointer-events-auto, so a plain click is the same here.
    fireEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    const posts = await vi.waitFor(() => {
      const calls = fetchFn.mock.calls.filter(
        ([url, init]) =>
          init?.method === "POST" && new URL(String(url)).pathname === "/equipment/l1/status",
      );
      if (calls.length < 2) throw new Error("undo not sent yet");
      return calls;
    });
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ status: "defective" });
    expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({ status: "active" });
  });

  it("US-EQU-05 a supply change offers Rückgängig which restores the previous level (P-10)", async () => {
    const substrate = item({
      id: "s1",
      type: "Substrate",
      name: "Kokos",
      status: null,
      supply: "available",
    });
    const fetchFn = fakeServer([substrate]);
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/equipment/s1/supply" && init?.method === "POST"
        ? response(200, { ...substrate, supply: JSON.parse(String(init.body)).supply })
        : (base?.(url, init) ?? response(404, {})),
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-s1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Wird knapp" }));
    const undo = await screen.findByRole("button", { name: "Rückgängig" });
    // The toast of the undo carries the result; the live region adds no second message for it (SG-FEED-02).
    expect(said()).toBe("");
    fireEvent.click(undo);
    const posts = await vi.waitFor(() => {
      const calls = fetchFn.mock.calls.filter(
        ([url, init]) =>
          init?.method === "POST" && new URL(String(url)).pathname === "/equipment/s1/supply",
      );
      if (calls.length < 2) throw new Error("undo not sent yet");
      return calls;
    });
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({ supply: "low" });
    expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({ supply: "available" });
  });
});

const NBSP = "\u00a0";
const CUTTING = zone({ zoneId: "z1", name: "Zone 1 · Stecklingslicht", specimens: 0, lamps: [] });

describe("US-QS-32 zone names and a missing zone in equipment", () => {
  it("US-QS-32 a lamp row names its zone in brackets, a lamp without a zone reads 'Lichtzone fehlt'", async () => {
    fakeServer(
      [
        item({ id: "e1", name: "Regal Lampe", lightZoneId: "z1" }),
        item({ id: "e2", name: "Lose Lampe", lightZoneId: null }),
      ],
      undefined,
      { zones: [CUTTING], unassigned: [] },
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    const layer = await screen.findByRole("dialog", { name: "Geräte" });
    const regal = await within(layer).findByRole("button", { name: /Regal Lampe/ });
    expect(plain(regal.textContent)).toContain("Lampe · Zone 1 (Stecklingslicht)");
    expect(regal.textContent).not.toContain("Zone 1 · Stecklingslicht");
    const lose = within(layer).getByRole("button", { name: /Lose Lampe/ });
    expect(lose.textContent).toContain("Lichtzone fehlt");
    expect(lose.textContent).not.toContain("ohne Zone");
  });

  it("US-QS-32 the record of a lamp keeps the zone in its own fact without brackets, and says 'Lichtzone fehlt' when there is none", async () => {
    fakeServer([item({ id: "e1", name: "Regal Lampe", lightZoneId: "z1" })], undefined, {
      zones: [CUTTING],
      unassigned: [],
    });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-e1");
    const card = await screen.findByRole("dialog", { name: "Regal Lampe" });
    expect(card.textContent).toContain("Lichtzone");
    expect(card.textContent).toContain("Zone 1 · Stecklingslicht");
    expect(card.textContent).not.toContain("Zone 1 (Stecklingslicht)");
  });

  it("US-QS-32 F-0228 a device value breaks only inside a word; the record's facts stack in a narrow box", async () => {
    fakeServer(
      [item({ id: "e1", name: "Regal Lampe", manufacturer: "Acme", model: "Modell X" })],
      undefined,
      {
        zones: [],
        unassigned: [],
      },
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=item-e1");
    const card = await screen.findByRole("dialog", { name: "Regal Lampe" });
    const value = within(card).getByText("Acme Modell X");
    expect(value.className.split(" ")).toContain("[overflow-wrap:break-word]");
    expect(value.className).not.toContain("break-all");
    const facts = card.querySelector("dl") as HTMLElement;
    expect(facts.className.split(" ")).toContain("grid-cols-1");
    expect(facts.className).toContain("@min-[12rem]:grid-cols-[auto_minmax(0,1fr)]");
    expect(facts.parentElement?.className.split(" ")).toContain("@container");
  });

  it("US-QS-32 a lamp's watts group the thousands the German way: 1.500 W, with no break before the unit", async () => {
    fakeServer([], undefined, NO_ZONES, { limit: null, lamps: [lightOf({ powerW: 1500 })] });
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const card = (await screen.findByText("Lampe Regal")).closest("details") as HTMLElement;
    expect(card.textContent).toContain("1.500\u00a0W");
    expect(card.textContent).not.toContain("1500");
  });

  it("US-QS-32 the lamp sheet reads '15 W · Zone 1 (Stecklingslicht)' with no break in the power, and 'Lichtzone fehlt' without a zone", async () => {
    fakeServer(
      [],
      undefined,
      { zones: [CUTTING], unassigned: [] },
      {
        limit: null,
        lamps: [
          lightOf({
            powerW: 15,
            zone: { id: "z1", name: "Zone 1 · Stecklingslicht", luxCeiling: 1500 },
          }),
          lightOf({ id: "l2", name: "Lampe Keller", zone: null, powerW: 20 }),
        ],
      },
    );
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=lamps");
    const card = (await screen.findByText("Lampe Regal")).closest("details") as HTMLElement;
    expect(card.textContent).toContain(`15${NBSP}W · Zone 1 (Stecklingslicht)`);
    const keller = (await screen.findByText("Lampe Keller")).closest("details") as HTMLElement;
    expect(keller.textContent).toContain(`20${NBSP}W · Lichtzone fehlt`);
  });
});

// A row of the overview holds its value twice, one copy per width (equipment-tiles.tsx). jsdom has no layout, so the text a
// row reads at one width is taken by leaving out the copy that width hides: beside the name at 18 rem and up, under it below.
const readsAt = (row: HTMLElement, width: "beside" | "under") => {
  const copy = row.cloneNode(true) as HTMLElement;
  const hidden = width === "beside" ? "@min-[18rem]:hidden" : "hidden";
  for (const span of Array.from(copy.querySelectorAll("span"))) {
    if (span.classList.contains(hidden)) span.remove();
  }
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("US-QS-32 the equipment rows are flat grouped rows (FX-35, SG-LIST-03, SG-SHAPE-03)", () => {
  it("US-QS-32 the six parts are rows of one grouped list in their order, each with its name and info, and each opens its layer", async () => {
    fakeServer([item(), item({ id: "e2", name: "Timer A", type: "Timer" })]);
    view(<EquipmentPage api="http://api" token={token} />);
    const first = await screen.findByRole("button", { name: /^Geräte 2/ });
    const list = first.closest("ul") as HTMLElement;
    expect(Array.from(list.children).every((child) => child.tagName === "LI")).toBe(true);
    expect(list.children).toHaveLength(6);
    const rows = within(list).getAllByRole("button");
    const names = [
      "Geräte 2 Geräte",
      "Kosten unbekannt",
      "Bedarf nichts fehlt",
      "Lampen und Zonen 0 Lampen",
      "Sensoren 0 Sensoren",
      "Geräte-Wünsche 0 offene Wünsche",
    ];
    expect(rows.map((row) => readsAt(row, "beside"))).toEqual(names);
    expect(rows.map((row) => readsAt(row, "under"))).toEqual(names);
    expect(rows.every((row) => row.getAttribute("aria-haspopup") === "dialog")).toBe(true);
    // The layer is modal: the list behind it is hidden from assistive technology, so the row is read before the tap.
    const costs = rows[1] as HTMLElement;
    await userEvent.click(costs);
    expect(await screen.findByRole("dialog", { name: "Kosten" })).toBeTruthy();
    expect(costs.getAttribute("aria-expanded")).toBe("true");
  });

  it("US-QS-32 each overview value is in its row once per width: beside the name from 18 rem, under it below", async () => {
    fakeServer([item()]);
    view(<EquipmentPage api="http://api" token={token} />);
    const first = await screen.findByRole("button", { name: /^Geräte 1/ });
    const list = first.closest("ul") as HTMLElement;
    // The list is the size container of its rows, so the width of the row decides the shape.
    expect(list.parentElement?.classList.contains("@container")).toBe(true);
    for (const row of within(list).getAllByRole("button")) {
      const spans = Array.from(row.querySelectorAll("span"));
      const beside = spans.filter(
        (span) =>
          span.classList.contains("hidden") && span.classList.contains("@min-[18rem]:inline"),
      );
      const under = spans.filter((span) => span.classList.contains("@min-[18rem]:hidden"));
      expect(beside).toHaveLength(1);
      expect(under).toHaveLength(1);
      expect(beside[0]?.textContent).toBe(under[0]?.textContent);
    }
  });

  it("US-QS-32 an item is one object row: a drawn placeholder, its name, the facts line, and the Defekt badge as its one trailing element", async () => {
    fakeServer([item({ id: "e1", name: "Lampe defekt", status: "defective" })]);
    view(<EquipmentPage api="http://api" token={token} />, "/?sheet=items");
    const row = await screen.findByRole("button", { name: /Lampe defekt/ });
    expect(row.querySelector('[class~="size-[56px]"] svg')).not.toBeNull();
    expect(plain(row.querySelector("[data-row-meta]")?.textContent)).toBe(
      "Lampe · Lichtzone fehlt",
    );
    expect(within(row).getByText("Defekt").className).toContain("bg-warning");
    // The badge takes the place of the chevron: the placeholder is the row's only icon (SG-LIST-03).
    expect(row.querySelectorAll("svg")).toHaveLength(1);
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    await userEvent.click(row);
    expect(await screen.findByRole("dialog", { name: "Lampe defekt" })).toBeTruthy();
  });
});

describe("US-QS-32 · DS-52 the placeholder of the equipment has the shape of the loaded page", () => {
  it("US-QS-32 · DS-52 one block of the default button (44 px, the full width) and the six parts; no help line", () => {
    const { container } = render(<EquipmentPageSkeleton label="Geräte werden geladen …" />);
    const status = container.querySelector("[role=status]") as HTMLElement;
    const blocks = Array.from(status.children).filter((el) => el.tagName === "DIV");
    // The one block is the button of the page (Body: "Gerät erfassen", min-h 44 px, the column width); the list follows it.
    expect(blocks).toHaveLength(1);
    const button = blocks[0] as HTMLElement;
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["h-11", "w-full"]));
    expect(button.className).not.toContain("w-40");
    expect(status.querySelector(".h-10")).toBeNull();
    expect(status.querySelectorAll("li")).toHaveLength(6);
  });
});

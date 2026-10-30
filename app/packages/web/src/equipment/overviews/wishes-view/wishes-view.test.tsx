// @vitest-environment jsdom
import { MemoryRouter } from "react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquipmentPage } from "../../equipment-page/equipment-page";

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

/** The wishes are a layer of the equipment (US-QS-22), so the page renders in a router that opens it. */
const view = (url = "/?sheet=wishes") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <EquipmentPage api="http://api" token={token} />
    </MemoryRouter>,
  );

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const wish = (extra: Record<string, unknown> = {}) => ({
  id: "w1",
  name: "Growlight X",
  equipmentType: "Lamp",
  productId: "GL-1",
  priceEur: 49.9,
  status: "wishlist",
  ...extra,
});

// US-EQU-08: equipment wishes next to the plant wishes; "Gekauft" prefills the equipment form.
function fakeServer(wishes: { open: unknown[]; bought: unknown[]; discarded: unknown[] }) {
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/equipment/wishes/w1/buy" && init?.method === "POST")
      return response(200, {
        changed: true,
        wish: wish({ status: "bought" }),
        prefill: { type: "Lamp", name: "Growlight X", productId: "GL-1", priceEur: 49.9 },
        hint: { text: "ok", nextAction: "next" },
      });
    if (path === "/equipment/wishes" && init?.method === "POST")
      return response(201, { wish: wish() });
    if (path === "/equipment/wishes") return response(200, wishes);
    if (path === "/equipment/zones") return response(200, { zones: [], unassigned: [] });
    if (path === "/equipment/lamps") return response(200, { limit: null, lamps: [] });
    if (path === "/equipment/sensors")
      return response(200, { sensors: [], specimens: [], locations: [] });
    if (path === "/equipment/needs") return response(200, { needs: [] });
    if (path === "/equipment/recommendations") return response(200, { recommendations: [] });
    if (path === "/equipment/sharing") return response(200, { shared: [] });
    if (path === "/equipment") return response(200, { equipment: [] });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-EQU-08 equipment wishes in the equipment page", () => {
  it("US-EQU-08 shows open wishes with unknown price as unknown and counts them apart from plants", async () => {
    fakeServer({ open: [wish({ priceEur: null, productId: null })], bought: [], discarded: [] });
    view();
    expect(await screen.findByText(/1 offener Equipment-Wunsch, getrennt/)).toBeTruthy();
    const list = screen.getByRole("list", { name: "Offene Equipment-Wünsche" });
    expect(list.textContent).toContain("Produkt-ID unbekannt");
    expect(list.textContent).toContain("Preis unbekannt");
  });

  it("US-EQU-08 'Gekauft' opens the equipment form with name, product id, type and price filled in", async () => {
    fakeServer({ open: [wish()], bought: [], discarded: [] });
    view();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Gekauft: Growlight X" }));
    const form = await screen.findByRole("region", { name: "Equipment erfassen" });
    await waitFor(() =>
      expect((within(form).getByLabelText("Art") as HTMLSelectElement).value).toBe("Lamp"),
    );
    expect((within(form).getByLabelText("Name") as HTMLInputElement).value).toBe("Growlight X");
    expect((within(form).getByLabelText("Produkt-ID (optional)") as HTMLInputElement).value).toBe(
      "GL-1",
    );
    expect((within(form).getByLabelText(/Preis/) as HTMLInputElement).value).toBe("49,9");
  });

  it("US-EQU-08 an empty list says what to do next", async () => {
    fakeServer({ open: [], bought: [], discarded: [] });
    view();
    expect(await screen.findByText(/Kein offener Equipment-Wunsch/)).toBeTruthy();
  });

  it("US-EQU-08 sends only the given fields of a new wish and refuses a missing name before sending", async () => {
    const fetchFn = fakeServer({ open: [], bought: [], discarded: [] });
    view();
    const form = await screen.findByRole("form", { name: "Equipment-Wunsch erfassen" });
    const user = userEvent.setup();
    await user.selectOptions(within(form).getByLabelText("Art des Wunsches"), "Timer");
    await user.click(within(form).getByRole("button", { name: "Wunsch speichern" }));
    expect(await within(form).findByText("Bitte gib einen Namen an.")).toBeTruthy();
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.type(within(form).getByLabelText("Name des Wunsches"), "Zeitschaltuhr");
    await user.click(within(form).getByRole("button", { name: "Wunsch speichern" }));
    await screen.findByText("Equipment-Wunsch „Zeitschaltuhr“ gespeichert.");
    const post = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      equipmentType: "Timer",
      name: "Zeitschaltuhr",
    });
  });
});

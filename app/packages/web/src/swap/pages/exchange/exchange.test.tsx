// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExchangePage } from "./exchange";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const SPECIMENS = [
  { id: "s1", name: "Haworthia", status: "plant" },
  { id: "s2", name: "Aloe", status: "archived" },
];
const health = { treatmentOpen: false, lastTreated: null };
const preview = (extra: Record<string, unknown> = {}) => ({
  specimenName: "Haworthia",
  shared: true,
  health,
  phase: null,
  offered: false,
  notice: "Manche Arten sind geschützt (CITES).",
  ...extra,
});
const offer = (extra: Record<string, unknown> = {}) => ({
  id: "o1",
  specimenId: "s1",
  specimenName: "Haworthia",
  type: "cutting",
  mode: "swap",
  wish: "Ableger",
  note: null,
  status: "open",
  createdAt: "2026-10-08T10:00:00.000Z",
  health: { treatmentOpen: false, lastTreated: { reason: "Wollläuse", doneAt: "2026-09-10" } },
  phase: "dormancy",
  ...extra,
});

function server(opts: { offers?: unknown[]; preview?: unknown } = {}) {
  const state = { offers: opts.offers ?? [], preview: opts.preview ?? preview() };
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, path: u.pathname, body });
        if (u.pathname.endsWith("/withdraw")) {
          state.offers = state.offers.map((o) => ({ ...(o as object), status: "withdrawn" }));
          return response(200, { status: "withdrawn" });
        }
        if (u.pathname.startsWith("/sharing/")) {
          state.preview = preview({ shared: true });
          return response(200, { share: "friends" });
        }
        state.offers = [offer(), ...state.offers];
        return response(201, offer());
      }
      if (u.pathname === "/offers") return response(200, { offers: state.offers });
      if (u.pathname === "/offers/preview") return response(200, state.preview);
      if (u.pathname === "/specimens") return response(200, { specimens: SPECIMENS });
      if (u.pathname === "/exchange/offers") return response(200, { offers: [] });
      if (u.pathname === "/sharing") return response(200, { shared: [] });
      return response(404, {});
    }),
  );
  return calls;
}
const view = () =>
  render(
    <MemoryRouter>
      <ExchangePage api="http://api" token={token} />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-08 exchange page: my offers and the dialog", () => {
  it("US-SOZ-08 an empty list says what to do next (P-09)", async () => {
    server();
    view();
    expect(await screen.findByText(/Du hast noch nichts angeboten/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zurück zu Freunde" }).getAttribute("href")).toBe(
      "/friends",
    );
  });

  it("US-SOZ-08 lists my offers with type, mode, wish, health details without agent and the dormancy phase", async () => {
    server({ offers: [offer()] });
    view();
    const list = await screen.findByRole("list", { name: "Meine Angebote" });
    const text = within(list).getByRole("listitem").textContent ?? "";
    expect(text).toContain("Haworthia");
    expect(text).toContain("Steckling · Tauschen");
    expect(text).toContain("Wunsch: Ableger");
    expect(text).toContain("Zuletzt behandelt: Wollläuse, 10.09.2026");
    expect(text).toContain("Zurzeit in der Ruhephase.");
    expect(text).toContain("Offen");
  });

  it("US-SOZ-08 withdrawing keeps the offer in the list as withdrawn (P-10)", async () => {
    const calls = server({ offers: [offer()] });
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Angebot für Haworthia zurückziehen" }),
    );
    expect(await screen.findByText("Das Angebot für Haworthia ist zurückgezogen.")).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: "POST", path: "/offers/o1/withdraw" });
    expect(await screen.findByText("Zurückgezogen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /zurückziehen/ })).toBeNull();
  });

  it("US-SOZ-08 the dialog offers only active specimens and shows the plant law notice for the chosen one", async () => {
    server();
    view();
    const select = await screen.findByLabelText("Exemplar");
    expect(within(select).queryByRole("option", { name: "Aloe" })).toBeNull();
    await userEvent.selectOptions(select, "s1");
    expect(await screen.findByText(/CITES/)).toBeTruthy();
    expect(screen.getByText("Keine Behandlung bekannt")).toBeTruthy();
  });

  it("US-SOZ-08 a private specimen cannot be offered until it is shared; the dialog sets the sharing", async () => {
    const calls = server({ preview: preview({ shared: false }) });
    view();
    await userEvent.selectOptions(await screen.findByLabelText("Exemplar"), "s1");
    expect(await screen.findByText(/nicht für Freunde freigegeben/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Angebot erstellen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Jetzt für Freunde freigeben" }));
    expect(await screen.findByText(/Freigegeben: Freunde sehen dieses Exemplar/)).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: "PUT", path: "/sharing/specimens/s1" });
    await vi.waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Angebot erstellen" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it("US-SOZ-08 an open treatment needs an explicit confirmation before the offer can be made", async () => {
    const calls = server({
      preview: preview({ health: { treatmentOpen: true, lastTreated: null } }),
    });
    view();
    await userEvent.selectOptions(await screen.findByLabelText("Exemplar"), "s1");
    expect(await screen.findByText("Behandlung offen")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Angebot erstellen" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: /Es läuft noch eine Behandlung/ }));
    expect(button.disabled).toBe(false);
    await userEvent.type(screen.getByLabelText("Wunsch (optional)"), "Ableger");
    await userEvent.click(button);
    expect(await screen.findByText(/Das Angebot ist erstellt/)).toBeTruthy();
    expect(calls[0]?.body).toEqual({
      specimenId: "s1",
      type: "cutting",
      mode: "swap",
      wish: "Ableger",
      confirmTreatment: true,
    });
  });

  it("US-SOZ-08 a specimen with an open offer cannot be offered twice", async () => {
    server({ preview: preview({ offered: true }) });
    view();
    await userEvent.selectOptions(await screen.findByLabelText("Exemplar"), "s1");
    expect(await screen.findByText(/schon ein offenes Angebot/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Angebot erstellen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

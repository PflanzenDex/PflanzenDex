// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendOffers } from "./friend-offers";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const offer = (extra: Record<string, unknown> = {}) => ({
  ownerId: "ben",
  ownerName: "Ben",
  offerId: "o1",
  specimenId: "s9",
  type: "cutting",
  mode: "swap",
  wish: "Ein Ableger",
  note: "Gut bewurzelt",
  offeredAt: "2026-10-08T10:00:00.000Z",
  photosShared: false,
  specimenName: "Aloe Ableger",
  speciesLatin: "Aloe vera",
  speciesGerman: "Echte Aloe",
  health: { treatmentOpen: false, lastTreated: { reason: "Wollläuse", doneAt: "2026-09-10" } },
  phase: "dormancy",
  lack: true,
  onWishlist: true,
  requested: false,
  ...extra,
});

function server(opts: { offers?: unknown[]; post?: () => Promise<Response> } = {}) {
  const state = { offers: opts.offers ?? [offer()] };
  const gets: string[] = [];
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST") {
        posts.push({ path: u.pathname, body: JSON.parse(String(init.body)) });
        if (opts.post) return opts.post();
        state.offers = state.offers.map((o) => ({ ...(o as object), requested: true }));
        return response(201, { swapId: "sw1" });
      }
      if (u.pathname === "/exchange/offers") {
        gets.push(u.search);
        return response(200, { offers: state.offers });
      }
      if (u.pathname === "/specimens")
        return response(200, {
          specimens: [
            { id: "m1", name: "Mein Haworthia", status: "plant" },
            { id: "m2", name: "Privat", status: "plant" },
            { id: "m3", name: "Alt", status: "archived" },
          ],
        });
      if (u.pathname === "/sharing")
        return response(200, { shared: [{ specimenId: "m1" }, { specimenId: "m3" }] });
      return response(404, {});
    }),
  );
  return { gets, posts };
}
const show = () => render(<FriendOffers api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-09 offers of friends in the exchange", () => {
  it("lists species, giver, type, mode, health, phase, the chip 'you lack it' and the wishlist hint", async () => {
    server();
    show();
    const list = await screen.findByRole("list", { name: "Angebote von Freunden" });
    const text = within(list).getByRole("listitem").textContent ?? "";
    expect(text).toContain("Echte Aloe");
    expect(text).toContain("Aloe vera");
    expect(text).toContain("Ben");
    expect(text).toContain("Steckling · Tauschen");
    expect(text).toContain("Zuletzt behandelt: Wollläuse, 10.09.2026");
    expect(text).toContain("Zurzeit in der Ruhephase.");
    expect(text).toContain("Fehlt dir");
    expect(text).toContain("Steht auf deiner Wunschliste");
    expect(text).toContain("Wunsch: Ein Ableger");
  });

  it("an unknown species is called unknown, not 'lacking' (P-08)", async () => {
    server({
      offers: [offer({ speciesLatin: null, speciesGerman: null, lack: null, onWishlist: false })],
    });
    show();
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(item.textContent).toContain("Art unbekannt");
    expect(item.textContent).not.toContain("Fehlt dir");
  });

  it("without offers it says what to do next (P-09)", async () => {
    server({ offers: [] });
    show();
    expect(await screen.findByText(/Zurzeit bietet kein Freund etwas an/)).toBeTruthy();
    expect(screen.getByText(/Lade Freunde ein/)).toBeTruthy();
  });

  it("the filters ask the server: type and 'you lack it'", async () => {
    const { gets } = server();
    show();
    await screen.findByRole("list", { name: "Angebote von Freunden" });
    await userEvent.selectOptions(screen.getByLabelText("Art des Angebots"), "plant");
    await vi.waitFor(() => expect(gets.at(-1)).toContain("type=plant"));
    await userEvent.click(screen.getByLabelText("Nur Arten, die mir fehlen"));
    await vi.waitFor(() => expect(gets.at(-1)).toContain("lack=true"));
  });

  it("requesting with free text sends one request, confirms it and marks the offer as requested", async () => {
    const { posts } = server();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Anfragen: Echte Aloe" }));
    await userEvent.type(screen.getByLabelText(/Was bietest du an/), "Einen Haworthia-Ableger");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Deine Anfrage für Echte Aloe ist gesendet/)).toBeTruthy();
    expect(posts).toEqual([
      { path: "/offers/o1/request", body: { counterText: "Einen Haworthia-Ableger" } },
    ]);
    await vi.waitFor(() => expect(screen.getByText("Angefragt")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Anfragen: Echte Aloe/ })).toBeNull();
  });

  it("the counter-offer lists only my active specimens that I share, and is sent by id", async () => {
    const { posts } = server();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Anfragen: Echte Aloe" }));
    const select = screen.getByLabelText("Eigenes Exemplar als Gegenangebot");
    const names = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Offen lassen", "Mein Haworthia"]);
    await userEvent.selectOptions(select, "m1");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await screen.findByText(/ist gesendet/);
    expect(posts[0]?.body).toEqual({ counterSpecimenId: "m1" });
  });

  it("a gift has no counter-offer fields, only the request", async () => {
    server({ offers: [offer({ mode: "give_away" })] });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Anfragen: Echte Aloe" }));
    expect(screen.queryByLabelText("Eigenes Exemplar als Gegenangebot")).toBeNull();
    expect(screen.queryByLabelText(/Was bietest du an/)).toBeNull();
    expect(screen.getByRole("button", { name: "Anfrage senden" })).toBeTruthy();
  });

  it("a refusal shows the German text of its code and keeps the form (P-10)", async () => {
    server({
      post: () =>
        response(409, { error: { code: "swap.already_requested", text: "raw server text" } }),
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Anfragen: Echte Aloe" }));
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Du hast dieses Angebot schon angefragt");
    expect(alert.textContent).not.toContain("raw server text");
    expect(screen.getByRole("button", { name: "Anfrage senden" })).toBeTruthy();
  });

  it("an offer I requested already shows 'Angefragt' and no request button", async () => {
    server({ offers: [offer({ requested: true })] });
    show();
    expect(await screen.findByText("Angefragt")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Anfragen:/ })).toBeNull();
  });
});

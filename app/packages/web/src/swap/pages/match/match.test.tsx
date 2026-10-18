// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchPage } from "./match";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const card = (n: number, extra: Record<string, unknown> = {}) => ({
  ownerId: "ben",
  ownerName: `Ben${n}`,
  offerId: `o${n}`,
  specimenId: `s${n}`,
  type: "cutting",
  mode: "swap",
  wish: "Ein Ableger",
  note: "Gut bewurzelt",
  offeredAt: "2026-10-08T10:00:00.000Z",
  photosShared: false,
  specimenName: "Ableger",
  speciesLatin: `Aloe vera ${n}`,
  speciesGerman: `Echte Aloe ${n}`,
  health: { treatmentOpen: false, lastTreated: { reason: "Wollläuse", doneAt: "2026-09-10" } },
  phase: "dormancy",
  lack: true,
  onWishlist: true,
  requested: false,
  reasons: [{ kind: "wishlist", species: `Aloe vera ${n}` }],
  ...extra,
});

function server(
  cards: unknown[],
  yes: (id: string) => Promise<Response> = async () =>
    response(201, { outcome: "requested", swapId: "sw1" }),
) {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST") {
        posts.push(u.pathname);
        return yes(u.pathname.split("/")[3] ?? "");
      }
      return u.pathname === "/exchange/match" ? response(200, { cards }) : response(404, {});
    }),
  );
  return posts;
}
const open = () =>
  render(
    <MemoryRouter>
      <MatchPage api="http://api" token={token} />
    </MemoryRouter>,
  );
const current = () => screen.findByRole("article");
const press = (name: RegExp | string) => userEvent.click(screen.getByRole("button", { name }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-TAU-01 match card in the web app", () => {
  it("US-TAU-01 shows one card with names, giver, type, mode, note, health and the reason, without any score", async () => {
    server([card(1), card(2)]);
    open();
    const c = within(await current());
    expect(c.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
    expect(c.getByText("Aloe vera 1")).toBeTruthy();
    expect(c.getByText("Von Ben1 · Steckling · Tauschen")).toBeTruthy();
    expect(c.getByText("Hinweis: Gut bewurzelt")).toBeTruthy();
    expect(c.getByText("Zuletzt behandelt: Wollläuse, 10.09.2026")).toBeTruthy();
    expect(c.getByText("Zurzeit in der Ruhephase.")).toBeTruthy();
    expect(c.getByText("Auf deiner Wunschliste: Aloe vera 1")).toBeTruthy();
    expect(screen.getByText("Karte 1 von 2")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%|Punkte|Sterne/);
  });

  it("US-TAU-01 offers Nein, Später and Ja as buttons that name species and giver (NFR-13)", async () => {
    server([card(1)]);
    open();
    await current();
    expect(
      screen.getByRole("button", { name: "Ja, anfragen: Echte Aloe 1 von Ben1" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nein: Echte Aloe 1 von Ben1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Später: Echte Aloe 1 von Ben1" })).toBeTruthy();
  });

  it("US-TAU-01 an empty deck names the reason and the next steps (P-09)", async () => {
    server([]);
    open();
    expect(await screen.findByText(/passt kein Angebot zu deiner Wunschliste/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tauschbörse öffnen" }).getAttribute("href")).toBe(
      "/friends/exchange",
    );
    expect(screen.getByRole("link", { name: "Wunsch hinzufügen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Freunde einladen" })).toBeTruthy();
  });
});

describe("US-TAU-03 Yes asks for the offer", () => {
  it("US-TAU-03 Ja sends one request for this offer and shows the next card with a status", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await current();
    await press(/^Ja, anfragen/);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts).toEqual(["/exchange/match/o1/yes"]);
    expect(screen.getByRole("status").textContent).toContain("Angefragt: Echte Aloe 1 von Ben1");
  });

  it("US-TAU-03 an offer that is already requested says so and moves on", async () => {
    server([card(1), card(2)], async () =>
      response(201, { outcome: "already_requested", swapId: null }),
    );
    open();
    await current();
    await press(/^Ja, anfragen/);
    expect(await screen.findByText("Schon angefragt: Echte Aloe 1.")).toBeTruthy();
  });

  it("US-TAU-03 an offer that is gone shows the reason (P-10) and the deck goes on", async () => {
    server([card(1), card(2)], async () =>
      response(409, { error: { code: "offer.not_active", text: "x" } }),
    );
    open();
    await current();
    await press(/^Ja, anfragen/);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Echte Aloe 1");
    expect(screen.getByRole("status").textContent).not.toContain("Angefragt");
  });

  it("US-TAU-03 any other refusal stays visible and the card stays", async () => {
    server([card(1), card(2)], async () =>
      response(500, { error: { code: "server.unknown", text: "x" } }),
    );
    open();
    await current();
    await press(/^Ja, anfragen/);
    expect(await screen.findByText(/Fehler aufgetreten/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });
});

describe("US-TAU-02 answering with buttons and swipe, kept in the session", () => {
  const swipe = async (from: number, to: number) => {
    const el = await current();
    Object.defineProperty(el, "clientWidth", { value: 300 });
    fireEvent.pointerDown(el, { clientX: from, clientY: 100 });
    fireEvent.pointerUp(el, { clientX: to, clientY: 105 });
  };

  it("US-TAU-02 Nein and Später write nothing to the server and the end view counts them with a next step", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await current();
    await press(/^Nein/);
    await press(/^Später/);
    expect(
      await screen.findByText(/Für jetzt durch. 0 angefragt, 1 für später, 1 abgelehnt./),
    ).toBeTruthy();
    expect(posts).toEqual([]);
    await press("Später-Karten ansehen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
  });

  it("US-TAU-02 Rückgängig takes back the last Nein", async () => {
    server([card(1), card(2)]);
    open();
    await current();
    await press(/^Nein/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    await press("Rückgängig");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });

  it("US-TAU-02 a swipe to the left is Nein", async () => {
    server([card(1), card(2)]);
    open();
    await swipe(250, 100);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
  });

  it("FR-TAU-03 a swipe to the right only asks for confirmation; nothing is sent before it", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await swipe(50, 250);
    expect(await screen.findByText("Bei Ben1 anfragen: Echte Aloe 1?")).toBeTruthy();
    expect(posts).toEqual([]);
    await press("Ja, anfragen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts).toEqual(["/exchange/match/o1/yes"]);
  });

  it("US-TAU-02 a swipe shorter than 40 percent of the card width decides nothing", async () => {
    server([card(1), card(2)]);
    open();
    await swipe(100, 190);
    expect(screen.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });
});

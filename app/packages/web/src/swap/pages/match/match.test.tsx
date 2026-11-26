// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filledIn, hasOwnBorder, isFilled, isPlain, isTinted } from "@/shared/ui/button.roles";
import { MatchPage } from "./match";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const card = (n: number, extra: Record<string, unknown> = {}) => ({
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
  reasons: [{ kind: "wishlist", species: `Aloe vera ${n}`, reasoning: null }],
  // The catalog picture of the species (US-QS-32): none by default, as the API answers an unknown one.
  imageUrl: null,
  imageSourceUrl: null,
  ...extra,
});

const entry = (n: number, answer: "no" | "later", state = "open") => ({
  offerId: `o${n}`,
  answer,
  answeredOn: "2026-10-12",
  speciesLatin: `Aloe vera ${n}`,
  speciesGerman: `Echte Aloe ${n}`,
  giverName: `Ben${n}`,
  state,
  card: state === "open" ? card(n) : null,
});

/** The reason the server gives for an empty deck (US-TAU-07); reset after each test. */
let emptyReason: string | null = null;
/** The open requests of the keeper the server counts (US-TAU-02); absent when `undefined`, reset after each test. */
let serverRequested: number | undefined;

function server(
  cards: unknown[],
  yes: (id: string) => Promise<Response> = async () =>
    response(201, { outcome: "requested", swapId: "sw1" }),
  entries: unknown[] = [],
  answer: (id: string, method: string) => Promise<Response> = async (_id, method) =>
    method === "DELETE"
      ? response(200, { undone: true })
      : response(200, { answeredOn: "2026-10-18" }),
) {
  const posts: string[] = [];
  const answers: string[] = [];
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/answer")) {
        const body =
          typeof init?.body === "string" ? (JSON.parse(init.body) as { answer?: string }) : {};
        answers.push(
          `${init?.method} ${u.pathname.split("/")[3]}${body.answer ? ` ${body.answer}` : ""}`,
        );
        return answer(u.pathname.split("/")[3] ?? "", init?.method ?? "");
      }
      if (init?.method === "POST") {
        posts.push(u.pathname);
        bodies.push(typeof init.body === "string" ? init.body : "");
        return yes(u.pathname.split("/")[3] ?? "");
      }
      return u.pathname === "/exchange/match"
        ? response(200, { cards, entries, empty: emptyReason, requested: serverRequested })
        : response(404, {});
    }),
  );
  return Object.assign(posts, { answers, bodies });
}
const open = (calm = false) =>
  render(
    <MemoryRouter>
      <MatchPage api="http://api" token={token} calm={calm} />
    </MemoryRouter>,
  );
const current = () => screen.findByRole("article");
const press = (name: RegExp | string) => userEvent.click(screen.getByRole("button", { name }));

/** Cards are 300 px wide in jsdom (no layout): the threshold is 120 px (starting value, assumption). */
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 300,
  });
});

afterEach(() => {
  emptyReason = null;
  serverRequested = undefined;
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
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

  it("US-TAU-04 shows the own reasoning of the wish exactly as written, and nothing when there is none", async () => {
    server([
      card(1, {
        reasons: [{ kind: "wishlist", species: "Aloe vera 1", reasoning: "Bleibt klein!" }],
      }),
      card(2),
    ]);
    open();
    const c = within(await current());
    expect(c.getByText("Dein Grund: Bleibt klein!")).toBeTruthy();
    expect(c.getByText("Auf deiner Wunschliste: Aloe vera 1")).toBeTruthy();
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    expect(screen.queryByText(/Dein Grund/)).toBeNull();
  });

  it("US-TAU-01 offers Ablehnen, Später and Anfragen as buttons that name species and giver (NFR-13)", async () => {
    server([card(1)]);
    open();
    await current();
    expect(screen.getByRole("button", { name: "Anfragen: Echte Aloe 1 von Ben1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ablehnen: Echte Aloe 1 von Ben1" })).toBeTruthy();
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
    await press(/^Anfragen:/);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect([...posts]).toEqual(["/exchange/match/o1/yes"]);
    expect(screen.getByRole("status").textContent).toContain("Angefragt: Echte Aloe 1 von Ben1");
  });

  it("US-TAU-03 an offer that is already requested says so and moves on", async () => {
    server([card(1), card(2)], async () =>
      response(201, { outcome: "already_requested", swapId: null }),
    );
    open();
    await current();
    await press(/^Anfragen:/);
    expect(await screen.findByText("Schon angefragt: Echte Aloe 1.")).toBeTruthy();
  });

  it("US-TAU-03 an answer on an offer I already requested is refused as such: the card moves on with that reason and nothing is stored", async () => {
    const posts = server([card(1), card(2)], undefined, [], async () =>
      response(409, { error: { code: "swap.already_requested", text: "x" } }),
    );
    open();
    await current();
    await press(/^Ablehnen:/);
    expect(await screen.findByText("Schon angefragt: Echte Aloe 1.")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts.answers).toEqual(["PUT o1 no"]);
    expect(screen.getByRole("region", { name: "Abgelehnt (0)" })).toBeTruthy();
  });

  it("US-TAU-06 P-10 a Later entry whose offer I requested stays listed, with a link to Requests and no silent drop", async () => {
    server([card(2)], undefined, [entry(1, "later", "requested")]);
    open();
    await current();
    const section = within(screen.getByRole("region", { name: "Später ansehen (1)" }));
    expect(section.getByText("Schon angefragt, du findest sie unter Anfragen.")).toBeTruthy();
    expect(section.getByRole("link", { name: /^Anfrage ansehen/ }).getAttribute("href")).toBe(
      "/friends/exchange?part=requests",
    );
  });

  it("US-TAU-03 an offer that is gone shows the reason (P-10) and the deck goes on", async () => {
    server([card(1), card(2)], async () =>
      response(409, { error: { code: "offer.not_active", text: "x" } }),
    );
    open();
    await current();
    await press(/^Anfragen:/);
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
    await press(/^Anfragen:/);
    expect(await screen.findByText(/Fehler aufgetreten/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });
});

describe("US-TAU-02 answering with buttons and swipe, stored privately", () => {
  const swipe = async (from: number, to: number) => {
    const el = await current();
    fireEvent.pointerDown(el, { clientX: from, clientY: 100 });
    fireEvent.pointerMove(el, { clientX: to, clientY: 105 });
    fireEvent.pointerUp(el, { clientX: to, clientY: 105 });
  };
  const swipeUp = async (from: number, to: number) => {
    const el = await current();
    fireEvent.pointerDown(el, { clientX: 150, clientY: from });
    fireEvent.pointerMove(el, { clientX: 150, clientY: to });
    fireEvent.pointerUp(el, { clientX: 150, clientY: to });
  };
  /** The moving layer of the card (its own transform, the parent of the article). */
  const movingLayer = async () => (await current()).parentElement as HTMLElement;

  it("US-TAU-02 Ablehnen and Später are stored for this account, send no request, and the end view counts them with a next step", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await current();
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    expect(screen.getByRole("status").textContent).toBe(
      "Abgelehnt: Echte Aloe 1. Der Freund erfährt davon nichts.",
    );
    await press(/^Später/);
    expect(
      await screen.findByText("Für jetzt durch: 0 angefragt, 1 für später, 1 abgelehnt"),
    ).toBeTruthy();
    expect([...posts]).toEqual([]);
    expect(posts.answers).toEqual(["PUT o1 no", "PUT o2 later"]);
    await press("Später-Karten ansehen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
  });

  it("US-TAU-02 a failed write keeps the card and shows the error; nothing moves on silently (P-10)", async () => {
    server([card(1), card(2)], undefined, [], async () =>
      response(500, { error: { code: "server.unknown", text: "x" } }),
    );
    open();
    await current();
    await press(/^Ablehnen:/);
    expect(await screen.findByText(/Fehler aufgetreten/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });

  it("US-TAU-02 Rückgängig takes back the stored Ablehnen", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await current();
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    await press("Rückgängig");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
    expect(posts.answers).toEqual(["PUT o1 no", "DELETE o1"]);
  });

  it("US-TAU-02 P-10 cards answered with Später earlier are findable in their own section and can be shown again", async () => {
    server([card(2)], undefined, [entry(1, "later")]);
    open();
    await current();
    const section = within(screen.getByRole("region", { name: "Später ansehen (1)" }));
    expect(section.getByText("Echte Aloe 1 von Ben1 · 12.10.2026")).toBeTruthy();
    await userEvent.click(section.getByRole("button", { name: "Diese Karten jetzt ansehen" }));
    expect(await screen.findByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });

  it("US-TAU-02 with only Später cards left the deck says so instead of looking empty", async () => {
    server([], undefined, [entry(1, "later")]);
    open();
    expect(await screen.findByText(/Für jetzt durch. 0 angefragt, 1 für später/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Später-Karten ansehen" })).toBeTruthy();
  });

  it("US-TAU-06 the lists show Später and Abgelehnt with dates; Wieder ansehen puts a declined card back into the deck", async () => {
    const posts = server([card(2)], undefined, [entry(1, "no"), entry(3, "later")]);
    open();
    await current();
    const declined = within(screen.getByRole("region", { name: "Abgelehnt (1)" }));
    expect(declined.getByText("Echte Aloe 1 von Ben1 · 12.10.2026")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Später ansehen (1)" })).getByText(
        "Echte Aloe 3 von Ben3 · 12.10.2026",
      ),
    ).toBeTruthy();
    await userEvent.click(declined.getByRole("button", { name: /^Wieder ansehen/ }));
    expect(await screen.findByRole("region", { name: "Abgelehnt (0)" })).toBeTruthy();
    expect(posts.answers).toEqual(["DELETE o1"]);
    await press(/^Ablehnen:/);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
  });

  it("US-TAU-06 P-10 an entry whose offer ended says why and is removed only by the keeper", async () => {
    const posts = server([card(2)], undefined, [
      entry(1, "later", "unavailable"),
      entry(4, "no", "wish_done"),
    ]);
    open();
    await current();
    expect(screen.getByText(/Nicht mehr verfügbar/)).toBeTruthy();
    expect(screen.getByText(/Wunsch erledigt/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Aus der Liste entfernen: Echte Aloe 1 von Ben1" }),
    );
    expect(await screen.findByRole("region", { name: "Später ansehen (0)" })).toBeTruthy();
    expect(posts.answers).toEqual(["DELETE o1"]);
    expect(screen.getByText(/Wunsch erledigt/)).toBeTruthy();
  });

  it("US-TAU-06 P-09 an empty list says what to do next", async () => {
    server([card(2)]);
    open();
    await current();
    expect(screen.getByText(/Noch nichts auf später gesetzt/)).toBeTruthy();
    expect(screen.getByText(/Noch nichts abgelehnt/)).toBeTruthy();
  });

  it("US-TAU-02 a swipe to the left is Ablehnen", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await swipe(250, 100);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts.answers).toEqual(["PUT o1 no"]);
  });

  it("FR-TAU-03 a swipe to the right only asks for confirmation; nothing is sent before it", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await swipe(50, 250);
    expect(await screen.findByText("Bei Ben1 anfragen: Echte Aloe 1?")).toBeTruthy();
    expect([...posts]).toEqual([]);
    await press("Anfragen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect([...posts]).toEqual(["/exchange/match/o1/yes"]);
  });

  it("US-TAU-02 a swipe shorter than 40 percent of the card width decides nothing", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await swipe(100, 190);
    expect(screen.getByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
    expect(posts.answers).toEqual([]);
  });

  it("US-TAU-02 a swipe up is Später: stored privately, the card leaves and nothing is sent", async () => {
    const posts = server([card(1), card(2)]);
    open();
    await swipeUp(300, 120);
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts.answers).toEqual(["PUT o1 later"]);
    expect([...posts]).toEqual([]);
  });

  it("FR-TAU-03 a swipe to the right keeps the card in its place while the confirmation asks", async () => {
    server([card(1), card(2)]);
    open();
    await swipe(50, 250);
    expect(await screen.findByText("Bei Ben1 anfragen: Echte Aloe 1?")).toBeTruthy();
    expect((await movingLayer()).style.getPropertyValue("--swipe-x")).toBe("0px");
  });

  it("US-TAU-02 Rückgängig brings the card back to its place", async () => {
    server([card(1), card(2)]);
    open();
    await current();
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    await press("Rückgängig");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 1" })).toBeTruthy();
    expect((await movingLayer()).style.getPropertyValue("--swipe-x")).toBe("0px");
  });

  it("NFR-13 with reduced motion a swipe to the left still answers, after the stamp and without a fly-off", async () => {
    const before = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const posts = server([card(1), card(2)]);
      open();
      await swipe(250, 100);
      expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
      expect(posts.answers).toEqual(["PUT o1 no"]);
    } finally {
      window.matchMedia = before;
    }
  });
});

const BOTH = {
  kind: "both_ways",
  giverName: "Ben1",
  offerId: "mine1",
  specimenId: "spec-mine",
  speciesLatin: "Echeveria elegans",
  speciesGerman: "Echeverie",
};
const bothCard = (n: number) =>
  card(n, { reasons: [{ kind: "wishlist", species: `Aloe vera ${n}`, reasoning: null }, BOTH] });

describe("US-TAU-05 fits both ways in the web app", () => {
  it("US-TAU-05 the chip and the sentence name my offer; a card without it says nothing about the giver's wishes", async () => {
    server([bothCard(1), card(2)]);
    open();
    const c = within(await current());
    expect(c.getByText("Passt in beide Richtungen")).toBeTruthy();
    expect(c.getByText("Ben1 möchte Echeverie von dir.")).toBeTruthy();
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    expect(screen.queryByText("Passt in beide Richtungen")).toBeNull();
    expect(document.body.textContent).not.toMatch(/%|Punkte|Sterne/);
  });

  it("US-TAU-07 US-TAU-05 calm mode keeps the chip: it is information, not a reward", async () => {
    server([bothCard(1)]);
    open(true);
    expect(within(await current()).getByText("Passt in beide Richtungen")).toBeTruthy();
  });

  it("US-TAU-05 Anfragen on such a card asks for one more confirmation and proposes my offer; nothing is sent before it", async () => {
    const posts = server([bothCard(1), card(2)]);
    open();
    await current();
    await press(/^Anfragen:/);
    expect(
      await screen.findByText(/Als Gegengabe schlagen wir dein Angebot vor: Echeverie/),
    ).toBeTruthy();
    expect([...posts]).toEqual([]);
    await press("Mit Echeverie anfragen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect([...posts]).toEqual(["/exchange/match/o1/yes"]);
    expect(posts.bodies.map((b) => JSON.parse(b))).toEqual([{ counterSpecimenId: "spec-mine" }]);
  });

  it("US-TAU-05 the counter-offer can be dropped before sending", async () => {
    const posts = server([bothCard(1), card(2)]);
    open();
    await current();
    await press(/^Anfragen:/);
    await press("Ohne Gegengabe anfragen");
    expect(await screen.findByRole("heading", { name: "Echte Aloe 2" })).toBeTruthy();
    expect(posts.bodies.map((b) => JSON.parse(b))).toEqual([{}]);
  });
});

describe("US-TAU-07 empty states and calm mode", () => {
  it.each([
    ["no_friends", /noch keine Freunde/, "Freund einladen", "/friends"],
    ["no_wishes", /Wunschliste ist leer/, "Wunsch hinzufügen", "/collection?view=wishlist"],
    ["no_offers", /bieten gerade nichts an/, "Tauschbörse öffnen", "/friends/exchange"],
    ["no_match", /passt kein Angebot/, "Tauschbörse öffnen", "/friends/exchange"],
    // US-TAU-03: every matching offer has my open request; the link opens the requests part, not the offers.
    ["all_requested", /hast du angefragt/, "Anfragen ansehen", "/friends/exchange?part=requests"],
    // US-TAU-07: no card is left because my No or Later holds the rest; the link opens the deck with its lists.
    ["all_answered", /Für jetzt durch/, "Später ansehen", "/friends/match"],
  ])(
    "US-TAU-07 P-09 an empty deck (%s) names the reason and the next step",
    async (reason, text, label, href) => {
      emptyReason = reason;
      server([]);
      open();
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    },
  );

  it("US-TAU-07 US-ACH-08 calm mode shows no counters at the end of the deck, normal mode does", async () => {
    server([card(1)]);
    open(true);
    await current();
    await press(/^Ablehnen:/);
    expect(await screen.findByText("Für jetzt durch")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/angefragt,|für später,/);
    cleanup();
    server([card(1)]);
    open(false);
    await current();
    await press(/^Ablehnen:/);
    expect(
      await screen.findByText("Für jetzt durch: 0 angefragt, 0 für später, 1 abgelehnt"),
    ).toBeTruthy();
  });
});

describe("US-QS-14 · US-QS-15 the matching offers are a sub-page with one page header", () => {
  it("US-QS-14 have exactly one h1 while they load, and the page header's back control leads to the exchange", () => {
    server([card(1)]);
    open();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Passende Angebote",
    ]);
    expect(screen.getByRole("link", { name: "Zurück zur Tauschbörse" }).getAttribute("href")).toBe(
      "/friends/exchange",
    );
  });

  it("US-QS-15 the frame is one screen, so at a large text size only the content region scrolls (DS-61)", () => {
    server([card(1)]);
    open();
    expect(document.querySelector("[data-fit-screen]")).not.toBeNull();
  });
});

describe("US-TAU-02 the summary counts the open requests the server holds", () => {
  it("US-TAU-02 P-10 after a reload the summary counts the open requests from the server", async () => {
    serverRequested = 4;
    server([], undefined, [entry(1, "later")]);
    open();
    expect(
      await screen.findByText("Für jetzt durch: 4 angefragt, 1 für später, 0 abgelehnt"),
    ).toBeTruthy();
  });

  it("US-TAU-02 a Yes in this session adds one to the count the server gave", async () => {
    serverRequested = 4;
    server([card(1), card(2)]);
    open();
    await current();
    await press(/^Anfragen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    await press(/^Ablehnen:/);
    expect(
      await screen.findByText("Für jetzt durch: 5 angefragt, 0 für später, 1 abgelehnt"),
    ).toBeTruthy();
  });

  it("US-TAU-02 a Yes that finds the offer already requested still counts, as a reload would", async () => {
    // The request was made elsewhere: the card had no open request of mine at load, so the server count lacks it.
    serverRequested = 4;
    server([card(1), card(2)], async () =>
      response(201, { outcome: "already_requested", swapId: null }),
    );
    open();
    await current();
    await press(/^Anfragen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    await press(/^Ablehnen:/);
    expect(
      await screen.findByText("Für jetzt durch: 5 angefragt, 0 für später, 1 abgelehnt"),
    ).toBeTruthy();
  });

  it("US-TAU-02 without a count from the server the summary starts at 0 and counts this session only", async () => {
    server([card(1)]);
    open();
    await current();
    await press(/^Anfragen:/);
    expect(
      await screen.findByText("Für jetzt durch: 1 angefragt, 0 für später, 0 abgelehnt"),
    ).toBeTruthy();
  });

  it("US-TAU-07 US-ACH-08 calm mode shows no count from the server either", async () => {
    serverRequested = 4;
    server([card(1)]);
    open(true);
    await current();
    await press(/^Ablehnen:/);
    expect(await screen.findByText("Für jetzt durch")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/angefragt,|für später,/);
  });
});

describe("US-QS-32 the match deck: no intro under the title, one line above the buttons (F-0279)", () => {
  it("US-QS-32 F-0279 no intro under the title; one line above the buttons names the friend, the rest sits behind Mehr erfahren", async () => {
    server([card(1)]);
    open();
    await current();
    expect(screen.queryByText(/Angebote deiner Freunde, deren Art/)).toBeNull();
    const line = screen.getByText("Ben1 erfährt nur von einer Anfrage.");
    expect(line.closest("details")).toBeNull();
    const more = line.parentElement?.querySelector("details");
    expect(more?.textContent).toContain("„Anfragen“ fragt das Angebot an");
    expect(more?.textContent).toContain(
      "Bei Tauschangeboten ergänzt du die Gegengabe unter Anfragen.",
    );
    expect(more?.textContent).not.toContain("Der Freund erfährt davon nichts");
  });

  it("US-QS-32 F-0279 a card without its giver's name says 'Ein Freund' in the same line", async () => {
    server([card(1, { ownerName: null })]);
    open();
    await current();
    expect(screen.getByText("Ein Freund erfährt nur von einer Anfrage.")).toBeTruthy();
  });
});

describe("US-QS-32 · SG-TYPE-04 at 200 % text the match deck scrolls as a whole", () => {
  /** Opens the deck at a 200 % root text size (32 px), as the keeper's setting gives it (US-QS-21, WCAG 1.4.4). The deck reads the size when it mounts, after the load. */
  async function openAt200(cards: unknown[] = [card(1)]) {
    server(cards);
    const size = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ fontSize: "32px" } as CSSStyleDeclaration);
    open();
    const article = await current();
    size.mockRestore();
    return article;
  }
  /** The root of the deck: its first line is "Karte n von m". */
  const deckRoot = () => screen.getByText(/^Karte \d+ von \d+$/).parentElement as HTMLElement;

  it("US-QS-32 · SG-TYPE-04 the decision row is not sticky at large text, so it cannot cover the card", async () => {
    await openAt200();
    const row = screen.getByRole("button", { name: /^Ablehnen:/ }).closest("div.border-t");
    expect(row).not.toBeNull();
    expect(row?.className).not.toContain("sticky");
  });

  it("US-QS-32 · SG-TYPE-04 the decision buttons come after the card in the flow, not over it", async () => {
    const article = await openAt200();
    for (const name of [/^Ablehnen:/, /^Später:/, /^Anfragen:/]) {
      const button = screen.getByRole("button", { name });
      expect(article.contains(button)).toBe(false);
      expect(
        article.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("US-QS-32 · SG-TYPE-04 no element between the card and the deck holds a scroll region of its own", async () => {
    const article = await openAt200();
    expect(article.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    const stop = deckRoot().parentElement;
    for (let el = article.parentElement; el && el !== stop; el = el.parentElement)
      expect(el.className).not.toMatch(/overflow-(y-)?(auto|scroll)/);
  });

  it("US-QS-32 · SG-PHOTO-01 at large text the picture of the card is not capped by the screen height", async () => {
    const article = await openAt200([
      card(1, { imageUrl: "https://upload.wikimedia.org/aloe.jpg" }),
    ]);
    const box = article.querySelector("figure[data-card-picture]")
      ?.firstElementChild as HTMLElement;
    expect(box.className).toContain("aspect-[4/3]");
    expect(box.className).not.toContain("dvh");
  });

  it("US-QS-14 at the normal text size the decision row stays sticky in a tall window, as before", async () => {
    server([card(1)]);
    open();
    await current();
    const row = screen.getByRole("button", { name: /^Ablehnen:/ }).closest("div.border-t");
    expect(row?.className).toContain("tall-window:sticky");
  });
});

describe("US-QS-32 · SG-BTN-01 the match deck has three button styles and no outline", () => {
  it("US-QS-32 · SG-BTN-02 the decision row has one filled 'Anfragen', a tinted 'Später' and a plain 'Ablehnen', and 'Rückgängig' is plain", async () => {
    server([card(1), card(2)]);
    open();
    await current();
    const no = screen.getByRole("button", { name: /^Ablehnen:/ });
    const later = screen.getByRole("button", { name: /^Später:/ });
    const yes = screen.getByRole("button", { name: /^Anfragen:/ });
    expect(isPlain(no)).toBe(true);
    expect(isTinted(later)).toBe(true);
    expect(isFilled(yes)).toBe(true);
    expect([no, later, yes].some(hasOwnBorder)).toBe(false);
    expect(filledIn(document.body)).toEqual([yes]);
    await press(/^Ablehnen:/);
    await screen.findByRole("heading", { name: "Echte Aloe 2" });
    const undo = screen.getByRole("button", { name: "Rückgängig" });
    expect(isPlain(undo)).toBe(true);
    expect(hasOwnBorder(undo)).toBe(false);
  });

  it("US-QS-32 · SG-BTN-01 the extra confirmation of a both-ways card has a filled 'Mit … anfragen', a tinted 'Ohne Gegengabe anfragen' and a plain 'Abbrechen'", async () => {
    server([bothCard(1), card(2)]);
    open();
    await current();
    await press(/^Anfragen:/);
    const withOffer = await screen.findByRole("button", { name: "Mit Echeverie anfragen" });
    const without = screen.getByRole("button", { name: "Ohne Gegengabe anfragen" });
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect(isFilled(withOffer)).toBe(true);
    expect(isTinted(without)).toBe(true);
    expect(isPlain(cancel)).toBe(true);
    expect([withOffer, without, cancel].some(hasOwnBorder)).toBe(false);
  });

  it("US-QS-32 · SG-BTN-02 in the lists of answers a row's buttons are plain, the one of a list is tinted, none is filled", async () => {
    server([card(2)], undefined, [
      entry(1, "no"),
      entry(3, "later"),
      entry(5, "no", "requested"),
      entry(7, "later", "unavailable"),
    ]);
    open();
    await current();
    const lists = [
      within(screen.getByRole("region", { name: /^Später ansehen/ })),
      within(screen.getByRole("region", { name: /^Abgelehnt/ })),
    ];
    const rowButtons = lists.flatMap((list) => [
      ...list.queryAllByRole("link", { name: /^Anfrage ansehen: / }),
      ...list.queryAllByRole("button", { name: /^(Wieder ansehen|Aus der Liste entfernen)/ }),
    ]);
    expect(rowButtons).toHaveLength(4);
    for (const b of rowButtons) {
      expect(isPlain(b), b.textContent ?? "").toBe(true);
      expect(hasOwnBorder(b)).toBe(false);
    }
    const showLater = lists[0]?.getByRole("button", { name: "Diese Karten jetzt ansehen" });
    expect(showLater && isTinted(showLater)).toBe(true);
    expect(filledIn(screen.getByRole("region", { name: /^Abgelehnt/ }))).toEqual([]);
    expect(filledIn(screen.getByRole("region", { name: /^Später ansehen/ }))).toEqual([]);
  });
});

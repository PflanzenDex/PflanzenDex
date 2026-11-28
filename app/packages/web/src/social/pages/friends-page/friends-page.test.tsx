// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { errorText } from "@/shared/lib/error-text";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { filledIn, hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { FriendsPage } from "./friends-page";

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

type Req = {
  id: string;
  otherName: string | null;
  direction: string;
  status: string;
};
const req = (extra: Partial<Req> = {}): Req => ({
  id: "r1",
  otherName: "Ben",
  direction: "received",
  status: "requested",
  ...extra,
});

type Initial = {
  incoming?: Req[];
  outgoing?: Req[];
  friends?: unknown[];
  /** The count of the news banner; `"fail"` makes the banner request fail. */
  news?: number | "fail";
  /** Open offers of friends and cards of the match deck. */
  offers?: number;
  matching?: number;
  /** Replaces the specimens; `failSpecies` makes the bulk write for that species refuse. */
  specimens?: { id: string; speciesId: string; name: string; status: string }[];
  failSpecies?: string;
};
type State = {
  incoming: Req[];
  outgoing: Req[];
  friends: unknown[];
  shared: { specimenId: string; photos: boolean }[];
  specimens: { id: string; speciesId: string; name: string; status: string }[];
  failSpecies?: string;
};
const SPECIMENS = [
  { id: "s1", speciesId: "sp1", name: "Zebra – M1", status: "plant" },
  { id: "s2", speciesId: "sp1", name: "Zebra – M2", status: "cutting" },
  { id: "s3", speciesId: "sp1", name: "Zebra – M3", status: "archived" },
];

/** The writes of the fake server; the state changes like the real one would. */
function write(
  state: State,
  path: string,
  body: { code?: string; decision?: string; share?: string },
) {
  if (path === "/friends/invitations")
    return response(201, {
      id: "c1",
      code: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
      expiresAt: "2026-10-13T10:00:00.000Z",
    });
  if (path === "/friends/requests") {
    if (body.code === "BAD")
      return response(409, { error: { code: "friend.code_used", text: "raw" } });
    if (body.code === "TWICE")
      return response(409, { error: { code: "idempotency.key_conflict", text: "raw" } });
    state.outgoing = [req({ direction: "sent", otherName: "Anna" })];
    return response(201, state.outgoing[0]);
  }
  if (path.startsWith("/sharing/")) {
    const id = path.split("/").pop() as string;
    if (path.includes("/species/") && id === state.failSpecies)
      return response(500, { error: { code: "internal", text: "raw" } });
    const ids = path.includes("/species/")
      ? state.specimens
          .filter((s) => s.speciesId === id && s.status !== "archived")
          .map((s) => s.id)
      : [id];
    state.shared =
      body.share === "friends"
        ? [...new Set([...state.shared.map((r) => r.specimenId), ...ids])].map((specimenId) => ({
            specimenId,
            photos: false,
          }))
        : state.shared.filter((r) => !ids.includes(r.specimenId));
    return response(200, { share: body.share, changed: ids.length });
  }
  if (path.endsWith("/end")) {
    state.friends = [];
    return response(200, { status: "ended" });
  }
  state.incoming = [];
  if (body.decision === "accept")
    state.friends = [
      { id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null },
    ];
  return response(200, { status: body.decision === "accept" ? "confirmed" : "declined" });
}

/** The reads behind the counts of the exchange tiles. */
function exchangeResponse(path: string, initial: Initial) {
  if (path === "/exchange/offers")
    return response(200, {
      offers: Array.from({ length: initial.offers ?? 0 }, (_, i) => ({ id: `o${i}` })),
    });
  if (path === "/exchange/match")
    return response(200, {
      cards: Array.from({ length: initial.matching ?? 0 }, (_, i) => ({ offerId: `o${i}` })),
      entries: [],
    });
  return undefined;
}

/** A fake server with the reads and writes of the page. */
function fakeServer(initial: Initial = {}) {
  const state: State = {
    incoming: initial.incoming ?? [],
    outgoing: initial.outgoing ?? [],
    friends: initial.friends ?? [],
    shared: [],
    specimens: initial.specimens ?? SPECIMENS,
    ...(initial.failSpecies ? { failSpecies: initial.failSpecies } : {}),
  };
  const calls: { path: string; body: unknown }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init && init.method !== "GET") {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      return write(state, path, body);
    }
    if (path === "/friends/requests")
      return response(200, { incoming: state.incoming, outgoing: state.outgoing });
    if (path === "/friends") return response(200, { friends: state.friends });
    if (path === "/feed/banner" && initial.news === "fail") return response(500, {});
    if (path === "/feed/banner")
      return response(200, {
        firstVisit: false,
        count: initial.news ?? 0,
        items: [],
        asOf: "2026-10-06T10:00:00.000Z",
      });
    if (path === "/feed")
      return response(200, {
        asOf: "2026-10-06T10:00:00.000Z",
        events: [],
        hint: { text: "Nichts Neues.", nextAction: "Schau später wieder vorbei." },
      });
    const exchange = exchangeResponse(path, initial);
    if (exchange) return exchange;
    if (path === "/specimens") return response(200, { specimens: state.specimens });
    if (path === "/sharing") return response(200, { shared: state.shared });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, calls };
}

type Options = { calm?: boolean; swapMark?: string; token?: () => Promise<string | undefined> };

/** Renders the page at its address; `sheet` opens that layer as a reload or a copied link would (US-QS-15). */
function show(sheet?: string, options: Options = {}, from = "") {
  const query = [sheet && `sheet=${sheet}`, from && `from=${from}`].filter(Boolean).join("&");
  return render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={[`/friends${query ? `?${query}` : ""}`]}>
        <FriendsPage api="http://api" token={token} {...options} />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
}

/** The text of a row as it reads: the no-break space of a count and the gap between title and meta line are plain spaces. */
const read = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** What the shared live region says (DS-69). */
const said = () => document.querySelector(".sr-only[aria-live=polite]")?.textContent?.trim() ?? "";

const friend = (n: number) => ({
  id: `f${n}`,
  name: `Freund${n}`,
  since: "2026-10-06T12:00:00.000Z",
  sharedSpecies: null,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

describe("US-SOZ-01 US-SOZ-02 page Freunde", () => {
  it("US-SOZ-02 shows the open requests with the display name only, and next steps when there are none (P-09)", async () => {
    fakeServer();
    show("requests");
    expect(await screen.findByText(/Keine offene Anfrage\./)).toBeTruthy();
    expect(screen.getByText(/Noch keine Freunde/)).toBeTruthy();
  });

  it("US-SOZ-02 accepting a request makes the person a friend and says so", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    show("requests");
    await userEvent.click(await screen.findByRole("button", { name: "Annehmen: Anfrage von Ben" }));
    expect(await screen.findByText(/Du bist jetzt mit Ben befreundet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests/r1/answer", body: { decision: "accept" } });
    expect(screen.queryByRole("button", { name: /annehmen/ })).toBeNull();
    // The requests layer is still open over the page: its content is found by text, not by role.
    expect(await screen.findByText("Meine Freunde · 1")).toBeTruthy();
    expect(await screen.findByText("Ben")).toBeTruthy();
  });

  it("US-SOZ-02 declining sends the answer and tells the receiver what the other side learns", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    show("requests");
    await userEvent.click(await screen.findByRole("button", { name: "Ablehnen: Anfrage von Ben" }));
    expect(await screen.findByText(/nur, dass sie nicht angenommen wurde/)).toBeTruthy();
    expect(calls[0]?.body).toEqual({ decision: "decline" });
  });

  it("US-QS-32 · SG-BTN-02 a request holds a tinted 'Annehmen' and a plain 'Ablehnen', no filled button and no border", async () => {
    fakeServer({ incoming: [req()] });
    show("requests");
    const accept = await screen.findByRole("button", { name: "Annehmen: Anfrage von Ben" });
    const decline = screen.getByRole("button", { name: "Ablehnen: Anfrage von Ben" });
    expect(isTinted(accept)).toBe(true);
    expect(isPlain(decline)).toBe(true);
    expect(hasOwnBorder(accept) || hasOwnBorder(decline)).toBe(false);
    const layer = screen.getByRole("dialog");
    expect(filledIn(layer)).toHaveLength(0);
  });

  it("US-SOZ-02 a request I sent that was declined shows only 'Nicht angenommen'", async () => {
    fakeServer({ outgoing: [req({ direction: "sent", otherName: "Anna", status: "declined" })] });
    show("requests");
    const list = await screen.findByRole("list", { name: "Anfragen" });
    expect(within(list).getByText("Nicht angenommen")).toBeTruthy();
    expect(within(list).getByText("Anfrage an Anna")).toBeTruthy();
  });

  it("US-SOZ-02 a person without a stored name stays 'Name unbekannt' (P-08)", async () => {
    fakeServer({ incoming: [req({ otherName: null })] });
    show("requests");
    expect(await screen.findByText(/Name unbekannt möchte/)).toBeTruthy();
  });

  it("US-SOZ-01 creates a code and shows it once with its expiry", async () => {
    fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("button", { name: "Einladungscode erzeugen" }));
    expect((await screen.findByLabelText("Dein Freundescode")).textContent).toBe(
      "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
    );
    expect(screen.getByText(/Einmal verwendbar, gültig bis 13\.10\.2026/)).toBeTruthy();
  });

  it("US-SOZ-01 sends a request with a code and lists it as waiting", async () => {
    const { calls } = fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.type(await screen.findByLabelText("Freundescode"), "ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Anfrage gesendet/, { selector: "p" })).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests", body: { code: "ABCD-EFGH" } });
  });

  it("US-QS-32 · F-0005 · SG-FEED-01 a sent request is the line of the form, in the place of its hint: announced once, no toast, nothing inserted", async () => {
    fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    const hint = await screen.findByText("Wer dir den Code gegeben hat, bekommt eine Anfrage.");
    await userEvent.type(screen.getByLabelText("Freundescode"), "ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    const result = "Anfrage gesendet. Sobald die Person sie annimmt, seid ihr befreundet.";
    // The same paragraph says it: the form gains no element and nothing moves (SG-FEED-05).
    expect((await screen.findByText(result, { selector: "p" })) === hint).toBe(true);
    expect(said()).toBe(result);
    expect(screen.queryAllByText(result).filter((e) => !e.hasAttribute("aria-live"))).toHaveLength(
      1,
    );
    expect(document.querySelector("[aria-live=assertive]")?.textContent).toBe("");
    // A new code brings the hint back, so a second request reads as a new one.
    await userEvent.type(screen.getByLabelText("Freundescode"), "X");
    expect(screen.getByText("Wer dir den Code gegeben hat, bekommt eine Anfrage.")).toBeTruthy();
  });

  it("US-QS-32 · SG-BASE-01 the focus does not fall to the body when 'Anfrage senden' is tapped: the button stays focusable while it sends, and a second tap sends nothing (issue 2464, F-0094)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    const { calls, fetchFn } = fakeServer();
    const plain = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) => {
      if (new URL(String(url)).pathname === "/friends/requests" && init?.method === "POST")
        await gate;
      return plain ? plain(url, init) : new Response("{}", { status: 404 });
    });
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.type(await screen.findByLabelText("Freundescode"), "ABCD-EFGH");
    const send = screen.getByRole("button", { name: "Anfrage senden" });
    await userEvent.click(send);
    const sending = await screen.findByRole("button", { name: "Sendet …" });
    expect(sending).toBe(send);
    expect(sending.getAttribute("aria-disabled")).toBe("true");
    expect(sending.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(sending);
    await userEvent.click(sending);
    release();
    await screen.findByText(/Anfrage gesendet/, { selector: "p" });
    expect(calls.filter((c) => c.path === "/friends/requests")).toHaveLength(1);
    // The focus stays on the button of the layer: not on the body, not lost (SG-BASE-01).
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Anfrage senden" }));
  });

  it("US-QS-32 · P-10 a request that cannot be sent at all (the sign-in is gone) is not silent: it shows as a toast with the German text", async () => {
    const { calls } = fakeServer();
    let signedOut = false;
    show("add", { token: async () => (signedOut ? undefined : "tok") });
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.type(await screen.findByLabelText("Freundescode"), "ABCD-EFGH");
    signedOut = true;
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    await waitFor(() =>
      expect(document.querySelector("[aria-live=assertive]")?.textContent).toContain(
        "nicht angemeldet",
      ),
    );
    expect(calls.filter((c) => c.path === "/friends/requests")).toEqual([]);
    expect(said()).toBe("");
  });

  it("US-SOZ-01 an empty code is refused before sending; a refused code shows its German text at the field (P-10)", async () => {
    const { calls } = fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText("Gib den Freundescode ein.")).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.type(screen.getByLabelText("Freundescode"), "BAD");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Freundescode wurde schon benutzt/)).toBeTruthy();
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("US-QS-03 · P-10 a key conflict of the request is an alert above the field with 'Hinweis schließen', which frees the key and returns the focus to the send button", async () => {
    fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.type(await screen.findByLabelText("Freundescode"), "TWICE");
    const send = screen.getByRole("button", { name: "Anfrage senden" });
    await userEvent.click(send);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    expect(screen.getByLabelText("Freundescode").getAttribute("aria-invalid")).not.toBe("true");
    await userEvent.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(send);
  });

  it("US-SOZ-02 shows no collection data of a friend, only name and start (P-05)", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(plain(list.textContent)).toBe(
      "BBen befreundet seit 06.10.2026 · Gemeinsame Arten: unbekannt (noch nichts freigegeben)",
    );
  });

  it("US-QS-32 each friend is one link to the friend's collection, named by its visible text, with a chevron", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 7 }],
    });
    show("friends");
    const row = await screen.findByRole("link", { name: /Ben befreundet seit 06\.10\.2026/ });
    expect(row.getAttribute("href")).toBe("/friends/f1");
    expect(plain(row.textContent)).toBe("BBen befreundet seit 06.10.2026 · Gemeinsame Arten: 7");
    expect(row.querySelector("svg.lucide-chevron-right")).not.toBeNull();
    // The row is the only control: no second link or button stands in it (US-QS-32, SG-TOUCH-02).
    expect(row.querySelectorAll("a, button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Freundschaft beenden/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Sammlung ansehen/ })).toBeNull();
  });

  it("US-QS-08 · WCAG 2.5.3 the bulk buttons' accessible names contain their visible text", async () => {
    fakeServer();
    show("sharing");
    for (const text of ["Alle teilen", "Alle zurückziehen"]) {
      const b = await screen.findByRole("button", { name: text });
      expect(b.textContent).toBe(text);
    }
  });

  it("US-QS-07 shows each friend with a decorative initials avatar, the name stays the text", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(within(list).queryByRole("img")).toBeNull();
    expect(within(list).getByText("B").getAttribute("aria-hidden")).toBe("true");
    expect(within(list).getByText("Ben")).toBeTruthy();
  });

  it("US-QS-32 the friends list no longer ends a friendship: the end waits on the friend's collection page", async () => {
    const { calls } = fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    await screen.findByRole("link", { name: /Ben befreundet seit/ });
    expect(screen.queryByRole("button", { name: /Freundschaft beenden/ })).toBeNull();
    expect(screen.queryByText(/alle Freigaben gelten dann nicht mehr/)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("US-SOZ-01 · P-09 US-QS-20 the next action comes first: 'Freund hinzufügen' stands before the rows, the friends and the help line", async () => {
    fakeServer({ friends: [friend(1)] });
    show();
    const add = await screen.findByRole("button", { name: "Freund hinzufügen" });
    const order = [
      add,
      screen.getByRole("button", { name: /^Anfragen/ }),
      screen.getByRole("button", { name: /^Neu bei Freunden/ }),
      await screen.findByRole("link", { name: /^Freund1 befreundet seit/ }),
      screen.getByRole("link", { name: /^Tauschbörse/ }),
      screen.getByRole("button", { name: "Mehr erfahren" }),
    ];
    for (let i = 1; i < order.length; i += 1)
      expect(order[i - 1]?.compareDocumentPosition(order[i] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
  });

  it("US-SOZ-04 everything is private by default; sharing a specimen says what friends see, withdrawing says when it takes effect", async () => {
    const { calls } = fakeServer();
    show("sharing");
    const box = await screen.findByRole("switch", { name: "Zebra – M1 mit Freunden teilen" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Alles ist privat, bis du es freigibst/)).toBeTruthy();
    // One row per plant with a trailing switch and no heading of the species above it (SG-LIST-03, US-QS-32).
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Zebra" })).toBeNull();
    expect(box.closest("li")?.querySelector("svg, img")).toBeTruthy();
    await userEvent.click(box);
    expect(
      await screen.findByText(/Freigegeben: Freunde sehen diese Pflanze ab jetzt/),
    ).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/sharing/specimens/s1", body: { share: "friends" } });
    await vi.waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Zebra – M1 mit Freunden teilen" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    await userEvent.click(screen.getByRole("switch", { name: "Zebra – M1 mit Freunden teilen" }));
    expect(await screen.findByText(/ab dem nächsten Abruf nicht mehr/)).toBeTruthy();
    expect(calls[1]).toEqual({ path: "/sharing/specimens/s1", body: { share: "private" } });
  });

  it("US-SOZ-04 · US-QS-20 archived specimens are not offered; one bulk action asks first and never widens without 'Ja'", async () => {
    const { calls } = fakeServer();
    show("sharing");
    await screen.findByRole("switch", { name: "Zebra – M2 mit Freunden teilen" });
    expect(screen.queryByRole("switch", { name: /M3/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    expect(screen.getByText(/Alle 2 Pflanzen für Freunde freigeben/)).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    expect(await screen.findByText(/Alle Pflanzen sind für Freunde freigegeben/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/sharing/species/sp1", body: { share: "friends" } });
    await userEvent.click(screen.getByRole("button", { name: "Alle zurückziehen" }));
    await userEvent.click(screen.getByRole("button", { name: "Alle zurückziehen" }));
    expect(await screen.findByText(/Alle Pflanzen sind zurückgezogen/)).toBeTruthy();
  });

  it("US-SOZ-04 · US-QS-20 · P-10 a bulk action refused on the 2nd of 3 species says how far it got and the switches show the real state", async () => {
    const specimens = ["sp1", "sp2", "sp3"].map((sp, n) => ({
      id: `s${n}`,
      speciesId: sp,
      name: `Art${n} – M1`,
      status: "plant",
    }));
    const { calls } = fakeServer({ specimens, failSpecies: "sp2" });
    show("sharing");
    await userEvent.click(await screen.findByRole("button", { name: "Alle teilen" }));
    await userEvent.click(screen.getByRole("button", { name: "Alle teilen" }));
    expect(await screen.findByText("1 von 3 Arten geändert, 2 nicht.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(errorText("internal"));
    expect(calls.map((c) => c.path)).toEqual(["/sharing/species/sp1", "/sharing/species/sp2"]);
    const on = async (name: string) =>
      (await screen.findByRole("switch", { name })).getAttribute("aria-checked") === "true";
    await vi.waitFor(async () => expect(await on("Art0 – M1 mit Freunden teilen")).toBe(true));
    expect(await on("Art1 – M1 mit Freunden teilen")).toBe(false);
    expect(await on("Art2 – M1 mit Freunden teilen")).toBe(false);
  });

  it("US-SOZ-03 shows the number of shared caught species of a friend, and unknown without sharing (P-08)", async () => {
    fakeServer({
      friends: [
        { id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 2 },
        { id: "f2", name: "Cleo", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 0 },
      ],
    });
    show("friends");
    expect(await screen.findByText(/Gemeinsame Arten: 2$/)).toBeTruthy();
    expect(screen.getByText(/Gemeinsame Arten: 0$/)).toBeTruthy();
  });

  it("US-QS-32 a friend is one flat row of the group: a row height of 44 px or more, the meta line is one line of text", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    const item = within(list).getByRole("listitem");
    const link = within(item).getByRole("link", { name: /Ben/ });
    expect(link.className).toContain("min-h-11");
    expect(plain(link.querySelector("span.text-muted-foreground")?.textContent)).toBe(
      "befreundet seit 06.10.2026 · Gemeinsame Arten: unbekannt (noch nichts freigegeben)",
    );
    // The group is one flat list: the rows touch and a hairline separates them (no card per row).
    expect(list.className).toContain("[&>li:first-child]:rounded-t-card");
    expect(list.className).toContain("[&>li+li]:before:inset-x-4");
  });

  it("US-QS-15 SG-TYPE-05 at 360 px the date of the friendship and the shared species are one part each, so neither breaks inside (issue 2640)", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 7 }],
    });
    show("friends");
    const link = await screen.findByRole("link", { name: /Ben befreundet seit 06\.10\.2026/ });
    const parts = Array.from(link.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "befreundet seit 06.10.2026 ·",
      "Gemeinsame Arten: 7",
    ]);
    // The text and the name of the link keep their order (WCAG 2.5.3).
    expect(plain(parts[0]?.parentElement?.textContent)).toBe(
      "befreundet seit 06.10.2026 · Gemeinsame Arten: 7",
    );
  });

  it("US-QS-14 the title sits on the page background like the other destinations, not inside a card", async () => {
    fakeServer();
    const { container } = show();
    await screen.findByText("Noch keine Freunde");
    expect((container.firstElementChild as HTMLElement).className).not.toContain("bg-card");
  });

  it("US-QS-20 · US-QS-15 the first screen: heading, one filled action, two counted rows, the friends, the exchange tiles, what friends see and one line of help", async () => {
    fakeServer({
      incoming: [req(), req({ id: "r2", otherName: "Cleo" })],
      friends: [friend(1)],
      news: 3,
      offers: 4,
      matching: 2,
    });
    show();
    expect(await screen.findByRole("heading", { name: "Freunde", level: 1 })).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Freund hinzufügen" })).className).toContain(
      "bg-primary",
    );
    // The counted rows say what the count counts (the no-break space keeps the number with its word, SG-TYPE-07).
    expect(read(screen.getByRole("button", { name: /^Anfragen/ }))).toBe(
      "Anfragen 2 warten auf deine Antwort",
    );
    await waitFor(() =>
      expect(read(screen.getByRole("button", { name: /^Neu bei Freunden/ }))).toBe(
        "Neu bei Freunden 3 neue Pflanzen",
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "Meine Freunde · 1", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Tauschbörse/ }).getAttribute("href")).toBe(
      "/friends/exchange",
    );
    expect(screen.getByRole("link", { name: /^Passende Angebote/ }).getAttribute("href")).toBe(
      "/friends/match",
    );
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /^Tauschbörse/ }).textContent).toBe("Tauschbörse4");
      expect(screen.getByRole("link", { name: /^Passende Angebote/ }).textContent).toBe(
        "Passende Angebote2",
      );
    });
    // "Meine Freunde" is no row that opens a layer any more: the friends are the page.
    expect(screen.queryByRole("button", { name: /^Meine Freunde/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Was Freunde sehen/ }).textContent).toBe(
      "Was Freunde sehen0 von 2 Pflanzen geteilt",
    );
    expect(screen.getByText(/Ohne deine Freigabe sieht niemand etwas\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mehr erfahren" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Only the one action is filled: the rows and tiles are neutral (DS-58).
    const filled = screen.getAllByRole("button").filter((b) => b.className.includes("bg-primary "));
    expect(filled.map((b) => b.textContent)).toEqual(["Freund hinzufügen"]);
  });

  it("US-QS-20 the two counted rows form one group of rows, and the exchange tiles stand two in a row while the labels fit (issue 1019)", async () => {
    fakeServer({ incoming: [], friends: [friend(1)], news: 0, offers: 0, matching: 0 });
    show();
    const requests = await screen.findByRole("button", { name: /^Anfragen/ });
    const news = screen.getByRole("button", { name: /^Neu bei Freunden/ });
    expect(requests.closest("ul")).toBe(news.closest("ul"));
    expect(requests.closest("ul")?.children).toHaveLength(2);
    const tile = screen.getByRole("link", { name: /^Tauschbörse/ });
    expect(tile.parentElement?.className).toContain("minmax(9rem,1fr)");
  });

  it("US-QS-20 · issue 2419 a count of 0 reads as a quiet line, 1 as the singular, and the rows open their layers", async () => {
    fakeServer({ incoming: [], friends: [friend(1)], news: 0 });
    show();
    expect(read(await screen.findByRole("button", { name: /^Anfragen/ }))).toBe(
      "Anfragen Nichts zu beantworten",
    );
    await waitFor(() =>
      expect(read(screen.getByRole("button", { name: /^Neu bei Freunden/ }))).toBe(
        "Neu bei Freunden Nichts Neues",
      ),
    );
    cleanup();
    fakeServer({ incoming: [req()], friends: [friend(1)], news: 1 });
    show();
    expect(read(await screen.findByRole("button", { name: /^Anfragen/ }))).toBe(
      "Anfragen 1 wartet auf deine Antwort",
    );
    await waitFor(() =>
      expect(read(screen.getByRole("button", { name: /^Neu bei Freunden/ }))).toBe(
        "Neu bei Freunden 1 neue Pflanze",
      ),
    );
  });

  it("US-QS-20 calm mode shows the tiles with their names but no counts, and asks for no offers", async () => {
    const { fetchFn } = fakeServer({ incoming: [req()], news: 3, offers: 4, matching: 2 });
    show(undefined, { calm: true });
    expect((await screen.findByRole("button", { name: /^Anfragen/ })).textContent).toBe("Anfragen");
    expect(screen.getByRole("button", { name: /^Neu bei Freunden/ }).textContent).toBe(
      "Neu bei Freunden",
    );
    expect(screen.getByRole("link", { name: "Tauschbörse" }).textContent).toBe("Tauschbörse");
    expect(screen.getByRole("link", { name: "Passende Angebote" }).textContent).toBe(
      "Passende Angebote",
    );
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/exchange/"))).toBe(false);
  });

  it("US-QS-20 · US-ONB-05 locked exchange tiles show the text mark, no count, and still lead to the lock page", async () => {
    const { fetchFn } = fakeServer({ friends: [friend(1)], offers: 4, matching: 2 });
    show(undefined, { swapMark: "Noch gesperrt" });
    const exchange = await screen.findByRole("link", { name: /^Tauschbörse/ });
    expect(exchange.textContent).toBe("Tauschbörse, Noch gesperrt");
    expect(exchange.getAttribute("href")).toBe("/friends/exchange");
    expect(screen.getByRole("link", { name: /^Passende Angebote/ }).textContent).toBe(
      "Passende Angebote, Noch gesperrt",
    );
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes("/exchange/"))).toBe(false);
  });

  it("US-QS-20 a count of the exchange that cannot load says so instead of showing a number (P-10)", async () => {
    const { fetchFn } = fakeServer({});
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      new URL(String(url)).pathname.startsWith("/exchange/")
        ? response(500, {})
        : fetchFn(url, init),
    );
    show();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /^Tauschbörse/ }).textContent).toBe(
        "Tauschbörsenicht geladen",
      ),
    );
  });

  it("US-QS-20 without a friend the screen says so and 'Freund hinzufügen' is the next step (P-09)", async () => {
    fakeServer();
    show();
    expect(await screen.findByRole("heading", { name: "Noch keine Freunde" })).toBeTruthy();
    expect(screen.getByText("Lade jemanden ein oder gib einen Code ein.")).toBeTruthy();
    // The action of an empty state shows once on the view (SG-STATE-01), and the request row stays reachable above it.
    expect(screen.getAllByRole("button", { name: "Freund hinzufügen" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Anfragen/ })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Meine Freunde/ })).toBeNull();
  });

  it("US-QS-20 · issue 2419 the empty state's 'Freund hinzufügen' opens the layer, and with a friend the page shows the action once too", async () => {
    fakeServer();
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Freund hinzufügen" }));
    expect(await screen.findByRole("dialog", { name: "Freund hinzufügen" })).toBeTruthy();
    cleanup();
    fakeServer({ friends: [friend(1)] });
    show();
    expect(await screen.findAllByRole("button", { name: "Freund hinzufügen" })).toHaveLength(1);
  });

  it("US-QS-20 a news count that cannot load says so instead of showing a number (P-10)", async () => {
    fakeServer({ news: "fail" });
    show();
    await waitFor(() =>
      expect(read(screen.getByRole("button", { name: /^Neu bei Freunden/ }))).toBe(
        "Neu bei Freunden nicht geladen",
      ),
    );
  });

  it("US-QS-20 each layer opens from its address and from its tile, and the address names it", async () => {
    fakeServer({ friends: [friend(1)] });
    for (const [sheet, title] of [
      ["add", "Freund hinzufügen"],
      ["requests", "Anfragen"],
      ["news", "Neu bei Freunden"],
      ["sharing", "Was Freunde sehen"],
      ["help", "Freunde und Freigaben"],
    ] as const) {
      show(sheet);
      expect(await screen.findByRole("dialog", { name: title }), sheet).toBeTruthy();
      cleanup();
    }
    show();
    await userEvent.click(await screen.findByRole("button", { name: /^Anfragen/ }));
    expect(await screen.findByRole("dialog", { name: "Anfragen" })).toBeTruthy();
  });

  it("US-QS-15 · US-QS-20 · issue 2418 the layer 'Neu bei Freunden' opens at half height below 768 px, as a sheet with two heights, and the other layers keep the height of their content", async () => {
    setViewportWidth(360);
    fakeServer({ friends: [friend(1)] });
    show("news");
    const news = await screen.findByRole("dialog", { name: "Neu bei Freunden" });
    expect(news.getAttribute("data-sheet-height")).toBe("two");
    expect(await within(news).findByRole("button", { name: "Vollbild" })).toBeTruthy();
    cleanup();
    show("help");
    const help = await screen.findByRole("dialog", { name: "Freunde und Freigaben" });
    expect(help.getAttribute("data-sheet-height")).toBe("fit");
  });

  it("US-QS-20 the layer 'Freund hinzufügen' has the two tabs 'Einladen' and 'Code eingeben'", async () => {
    fakeServer();
    show("add");
    const invite = await screen.findByRole("tab", { name: "Einladen" });
    const code = screen.getByRole("tab", { name: "Code eingeben" });
    expect(invite.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Einladungscode erzeugen" })).toBeTruthy();
    await userEvent.click(code);
    expect(code.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Freundescode")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Einladungscode erzeugen" })).toBeNull();
  });

  it("US-QS-20 the help layer holds the full explanation that the screen keeps to one line", async () => {
    fakeServer();
    show("help");
    expect(await screen.findByText(/nie Standort, Messwerte, Behandlungen/)).toBeTruthy();
    expect(screen.getByText(/Ein Zurückziehen gilt ab dem nächsten Abruf/)).toBeTruthy();
  });

  it("US-QS-20 · US-QS-15 the friends are one scrolling list: every friend, a counted heading, no pages at a tablet width either", async () => {
    setViewportWidth(1024);
    fakeServer({ friends: [1, 2, 3, 4, 5].map(friend) });
    show();
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "Meine Freunde · 5" })).toBeTruthy();
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
    expect(screen.getByText("Freund5")).toBeTruthy();
  });

  it("US-QS-20 · SG-NAV-02 an old position in the address (?from=9) is dropped: the friends start at the first one", async () => {
    fakeServer({ friends: [1, 2, 3, 4, 5].map(friend) });
    show(undefined, {}, "9");
    expect(await screen.findByText("Freund1")).toBeTruthy();
  });

  it("US-QS-20 · issue 2419 the friends are the page: the old layer 'Meine Freunde' opens nothing", async () => {
    fakeServer({ friends: [friend(1)] });
    show("friends");
    expect(await screen.findByRole("heading", { name: "Meine Freunde · 1" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-15 · US-QS-20 the requests are one scroll list too, and an old address with a position shows the list from its start", async () => {
    setViewportWidth(1024);
    fakeServer({
      incoming: [1, 2, 3, 4, 5].map((n) => req({ id: `r${n}`, otherName: `Person${n}` })),
    });
    show("requests", {}, "9");
    expect(await screen.findByText(/Person1 möchte/)).toBeTruthy();
    expect(screen.getByText(/Person5 möchte/)).toBeTruthy();
    expect(screen.queryByText(/Seite \d+ von \d+/)).toBeNull();
  });
});

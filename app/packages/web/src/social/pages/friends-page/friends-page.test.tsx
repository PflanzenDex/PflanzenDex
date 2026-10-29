// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
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
  requestedAt: string;
};
const req = (extra: Partial<Req> = {}): Req => ({
  id: "r1",
  otherName: "Ben",
  direction: "received",
  status: "requested",
  requestedAt: "2026-10-06T10:00:00.000Z",
  ...extra,
});

type Initial = {
  incoming?: Req[];
  outgoing?: Req[];
  friends?: unknown[];
  /** The count of the news banner; `"fail"` makes the banner request fail. */
  news?: number | "fail";
};
type State = {
  incoming: Req[];
  outgoing: Req[];
  friends: unknown[];
  shared: { specimenId: string; photos: boolean }[];
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
    state.outgoing = [req({ direction: "sent", otherName: "Anna" })];
    return response(201, state.outgoing[0]);
  }
  if (path.startsWith("/sharing/")) {
    const id = path.split("/").pop() as string;
    const ids = path.includes("/species/")
      ? SPECIMENS.filter((s) => s.status !== "archived").map((s) => s.id)
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

/** A fake server with the reads and writes of the page. */
function fakeServer(initial: Initial = {}) {
  const state: State = {
    incoming: initial.incoming ?? [],
    outgoing: initial.outgoing ?? [],
    friends: initial.friends ?? [],
    shared: [],
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
    if (path === "/specimens") return response(200, { specimens: SPECIMENS });
    if (path === "/sharing") return response(200, { shared: state.shared });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, calls };
}

type Options = { calm?: boolean };

/** Renders the page at its address; `sheet` opens that layer as a reload or a copied link would (US-QS-15). */
function show(sheet?: string, options: Options = {}, page = "") {
  const query = [sheet && `sheet=${sheet}`, page && `page=${page}`].filter(Boolean).join("&");
  return render(
    <MemoryRouter initialEntries={[`/friends${query ? `?${query}` : ""}`]}>
      <FriendsPage api="http://api" token={token} {...options} />
    </MemoryRouter>,
  );
}

const friend = (n: number) => ({
  id: `f${n}`,
  name: `Freund${n}`,
  since: "2026-10-06T12:00:00.000Z",
  sharedSpecies: null,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-01 US-SOZ-02 page Freunde", () => {
  it("US-SOZ-02 shows the open requests with the display name only, and next steps when there are none (P-09)", async () => {
    fakeServer();
    show("requests");
    expect(await screen.findByText(/Keine offenen Anfragen/)).toBeTruthy();
    expect(screen.getByText(/Noch keine Freunde/)).toBeTruthy();
  });

  it("US-SOZ-02 accepting a request makes the person a friend and says so", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    show("requests");
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage von Ben annehmen" }));
    expect(await screen.findByText(/Du bist jetzt mit Ben befreundet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests/r1/answer", body: { decision: "accept" } });
    expect(screen.queryByRole("button", { name: /annehmen/ })).toBeNull();
    expect(await screen.findByText("1 Freund")).toBeTruthy();
  });

  it("US-SOZ-02 declining sends the answer and tells the receiver what the other side learns", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    show("requests");
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage von Ben ablehnen" }));
    expect(await screen.findByText(/nur, dass sie nicht angenommen wurde/)).toBeTruthy();
    expect(calls[0]?.body).toEqual({ decision: "decline" });
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
    expect(await screen.findByText(/Anfrage gesendet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests", body: { code: "ABCD-EFGH" } });
  });

  it("US-SOZ-01 an empty code is refused before sending; a refused code shows its German text at the field (P-10)", async () => {
    const { calls } = fakeServer();
    show("add");
    await userEvent.click(await screen.findByRole("tab", { name: "Code eingeben" }));
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText("Bitte gib den Freundescode ein.")).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.type(screen.getByLabelText("Freundescode"), "BAD");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Freundescode wurde schon benutzt/)).toBeTruthy();
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("US-SOZ-02 shows no collection data of a friend, only name and start (P-05)", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(list.textContent).toBe(
      "BBenbefreundet seit 06.10.2026Gemeinsame Arten: unbekannt (noch nichts freigegeben)Sammlung ansehenFreundschaft beenden",
    );
  });

  it("US-QS-14 the two friend buttons sit in one wrapping row, like the buttons of the share cards", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const see = await screen.findByRole("link", { name: "Sammlung von Ben ansehen" });
    const end = screen.getByRole("button", { name: "Freundschaft mit Ben beenden" });
    const row = see.parentElement;
    expect(row).toBe(end.parentElement);
    expect(row?.className).toContain("flex-wrap");
    expect(row?.className).toContain("gap-2");
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

  it("US-SOZ-03 ending a friendship asks first, says what it does and then removes the friend", async () => {
    const { calls } = fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    await userEvent.click(
      await screen.findByRole("button", { name: "Freundschaft mit Ben beenden" }),
    );
    expect(screen.getByText(/alle Freigaben gelten dann nicht mehr/)).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(/alle Freigaben gelten dann nicht mehr/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Freundschaft mit Ben beenden" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, beenden" }));
    expect(await screen.findByText(/Freundschaft mit Ben beendet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/f1/end", body: {} });
    expect((await screen.findAllByText(/Noch keine Freunde/)).length).toBeGreaterThan(0);
  });

  it("US-SOZ-01 · P-09 US-QS-20 the next action comes first: 'Freund hinzufügen' stands before the tiles, rows and the help line", async () => {
    fakeServer();
    show();
    const add = await screen.findByRole("button", { name: "Freund hinzufügen" });
    const order = [
      add,
      screen.getByRole("button", { name: /^Anfragen/ }),
      screen.getByRole("button", { name: /^Meine Freunde/ }),
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
    const box = await screen.findByRole("checkbox", { name: "Zebra – M1: mit Freunden teilen" });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Alles ist privat, bis du es freigibst/)).toBeTruthy();
    await userEvent.click(box);
    expect(
      await screen.findByText(/Freigegeben: Freunde sehen dieses Exemplar ab jetzt/),
    ).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/sharing/specimens/s1", body: { share: "friends" } });
    expect(
      (await screen.findByRole("checkbox", {
        name: "Zebra – M1: mit Freunden teilen",
      })) as HTMLInputElement,
    ).toHaveProperty("checked", true);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Zebra – M1: mit Freunden teilen" }),
    );
    expect(await screen.findByText(/ab dem nächsten Abruf nicht mehr/)).toBeTruthy();
    expect(calls[1]).toEqual({ path: "/sharing/specimens/s1", body: { share: "private" } });
  });

  it("US-SOZ-04 archived specimens are not offered; the bulk action shares a whole species", async () => {
    const { calls } = fakeServer();
    show("sharing");
    await screen.findByRole("checkbox", { name: "Zebra – M2: mit Freunden teilen" });
    expect(screen.queryByRole("checkbox", { name: /M3/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Alle Exemplare von Zebra teilen" }));
    expect(
      await screen.findByText(/Alle Exemplare dieser Art sind für Freunde freigegeben/),
    ).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/sharing/species/sp1", body: { share: "friends" } });
    await userEvent.click(
      screen.getByRole("button", { name: "Alle Exemplare von Zebra zurückziehen" }),
    );
    expect(await screen.findByText(/Alle Exemplare dieser Art sind zurückgezogen/)).toBeTruthy();
  });

  it("US-SOZ-03 shows the number of shared caught species of a friend, and unknown without sharing (P-08)", async () => {
    fakeServer({
      friends: [
        { id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 2 },
        { id: "f2", name: "Cleo", since: "2026-10-06T12:00:00.000Z", sharedSpecies: 0 },
      ],
    });
    show("friends");
    expect(await screen.findByText("Gemeinsame Arten: 2")).toBeTruthy();
    expect(screen.getByText("Gemeinsame Arten: 0")).toBeTruthy();
  });

  it("US-SOZ-02 US-QS-14 a friend row stacks name, date, shared species and actions as separate items with a gap", async () => {
    fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z", sharedSpecies: null }],
    });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    const row = within(list).getByRole("listitem").firstElementChild
      ?.firstElementChild as HTMLElement;
    expect(row.className).toMatch(/(^|\s)grid(\s|$)/);
    expect(row.className).toMatch(/(^|\s)gap-\d/);
    const items = Array.from(row.children).map((c) => c.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Ben$/),
      expect.stringMatching(/^befreundet seit /),
      "Gemeinsame Arten: unbekannt (noch nichts freigegeben)",
      "Sammlung ansehenFreundschaft beenden", // one wrapping row, see the test below
    ]);
  });

  it("US-QS-14 the title sits on the page background like the other destinations, not inside a card", async () => {
    fakeServer();
    const { container } = show();
    await screen.findByText(/Noch keine Freunde/);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("bg-card");
  });

  it("US-QS-20 the first screen: heading, one filled action, the tiles with counts, the rows and one line of help", async () => {
    fakeServer({
      incoming: [req(), req({ id: "r2", otherName: "Cleo" })],
      friends: [friend(1)],
      news: 3,
    });
    show();
    expect(await screen.findByRole("heading", { name: "Freunde", level: 1 })).toBeTruthy();
    expect((await screen.findByRole("button", { name: "Freund hinzufügen" })).className).toContain(
      "bg-primary",
    );
    expect(screen.getByRole("button", { name: /^Anfragen/ }).textContent).toBe("Anfragen2");
    expect(await screen.findByRole("button", { name: /^Neu bei Freunden/ })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Neu bei Freunden/ }).textContent).toBe(
        "Neu bei Freunden3",
      ),
    );
    expect(screen.getByRole("link", { name: "Tauschbörse" }).getAttribute("href")).toBe(
      "/friends/exchange",
    );
    expect(screen.getByRole("link", { name: "Passende Angebote" }).getAttribute("href")).toBe(
      "/friends/match",
    );
    expect(screen.getByRole("button", { name: /^Meine Freunde/ }).textContent).toBe(
      "Meine Freunde1 Freund",
    );
    expect(screen.getByRole("button", { name: /^Was Freunde sehen/ }).textContent).toBe(
      "Was Freunde sehenNoch keine Exemplare".replace("Noch keine Exemplare", "Alles privat"),
    );
    expect(screen.getByText(/Ohne deine Freigabe sieht niemand etwas\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mehr erfahren" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Only the one action is filled: the tiles and rows are outline buttons (DS-58).
    const filled = screen.getAllByRole("button").filter((b) => b.className.includes("bg-primary "));
    expect(filled.map((b) => b.textContent)).toEqual(["Freund hinzufügen"]);
  });

  it("US-QS-20 calm mode shows the tiles with their names but no counts", async () => {
    fakeServer({ incoming: [req()], news: 3 });
    show(undefined, { calm: true });
    expect((await screen.findByRole("button", { name: /^Anfragen/ })).textContent).toBe("Anfragen");
    expect(screen.getByRole("button", { name: /^Neu bei Freunden/ }).textContent).toBe(
      "Neu bei Freunden",
    );
  });

  it("US-QS-20 without a friend the screen says so and 'Freund hinzufügen' is the next step (P-09)", async () => {
    fakeServer();
    show();
    expect(
      await screen.findByText(/Noch keine Freunde\. „Freund hinzufügen“ ist der nächste Schritt/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Freund hinzufügen" })).toBeTruthy();
  });

  it("US-QS-20 a news count that cannot load says so instead of showing a number (P-10)", async () => {
    fakeServer({ news: "fail" });
    show();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Neu bei Freunden/ }).textContent).toBe(
        "Neu bei Freundennicht geladen",
      ),
    );
  });

  it("US-QS-20 each layer opens from its address and from its tile, and the address names it", async () => {
    fakeServer({ friends: [friend(1)] });
    for (const [sheet, title] of [
      ["add", "Freund hinzufügen"],
      ["requests", "Anfragen"],
      ["news", "Neu bei Freunden"],
      ["friends", "Meine Freunde"],
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

  it("US-QS-20 a list longer than the layer is paged with 'Zurück' and 'Weiter'", async () => {
    fakeServer({ friends: [1, 2, 3, 4, 5].map(friend) });
    show("friends");
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByText("Seite 2 von 2")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Freunde" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(screen.getByText("Freund5")).toBeTruthy();
  });

  it("US-QS-20 requests are paged too, and a page address outside the range shows the nearest page", async () => {
    fakeServer({
      incoming: [1, 2, 3, 4, 5].map((n) => req({ id: `r${n}`, otherName: `Person${n}` })),
    });
    show("requests", {}, "9");
    expect(await screen.findByText("Seite 2 von 2")).toBeTruthy();
    expect(screen.getByText(/Person5 möchte/)).toBeTruthy();
  });
});

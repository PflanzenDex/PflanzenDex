// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FriendsPage } from "./friends-page";

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

type Initial = { incoming?: Req[]; outgoing?: Req[]; friends?: unknown[] };
type State = { incoming: Req[]; outgoing: Req[]; friends: unknown[] };

/** The writes of the fake server; the state changes like the real one would. */
function write(state: State, path: string, body: { code?: string; decision?: string }) {
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
  if (path.endsWith("/end")) {
    state.friends = [];
    return response(200, { status: "ended" });
  }
  state.incoming = [];
  if (body.decision === "accept")
    state.friends = [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z" }];
  return response(200, { status: body.decision === "accept" ? "confirmed" : "declined" });
}

/** A fake server with the reads and writes of the page. */
function fakeServer(initial: Initial = {}) {
  const state: State = {
    incoming: initial.incoming ?? [],
    outgoing: initial.outgoing ?? [],
    friends: initial.friends ?? [],
  };
  const calls: { path: string; body: unknown }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      return write(state, path, body);
    }
    if (path === "/friends/requests")
      return response(200, { incoming: state.incoming, outgoing: state.outgoing });
    if (path === "/friends") return response(200, { friends: state.friends });
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return { fetchFn, calls };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-SOZ-01 US-SOZ-02 page Freunde", () => {
  it("US-SOZ-02 shows the open requests with the display name only, and next steps when there are none (P-09)", async () => {
    fakeServer();
    render(<FriendsPage api="http://api" token={token} />);
    expect(await screen.findByText(/Keine offenen Anfragen/)).toBeTruthy();
    expect(screen.getByText(/Noch keine Freunde/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Freunde", level: 1 })).toBeTruthy();
  });

  it("US-SOZ-02 accepting a request makes the person a friend and says so", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage von Ben annehmen" }));
    expect(await screen.findByText(/Du bist jetzt mit Ben befreundet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests/r1/answer", body: { decision: "accept" } });
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(within(list).getByText("Ben")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /annehmen/ })).toBeNull();
  });

  it("US-SOZ-02 declining sends the answer and tells the receiver what the other side learns", async () => {
    const { calls } = fakeServer({ incoming: [req()] });
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage von Ben ablehnen" }));
    expect(await screen.findByText(/nur, dass sie nicht angenommen wurde/)).toBeTruthy();
    expect(calls[0]?.body).toEqual({ decision: "decline" });
  });

  it("US-SOZ-02 a request I sent that was declined shows only 'Nicht angenommen'", async () => {
    fakeServer({ outgoing: [req({ direction: "sent", otherName: "Anna", status: "declined" })] });
    render(<FriendsPage api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Von dir gesendete Anfragen" });
    expect(within(list).getByText("Nicht angenommen")).toBeTruthy();
    expect(within(list).getByText("Anfrage an Anna")).toBeTruthy();
  });

  it("US-SOZ-02 a person without a stored name stays 'Name unbekannt' (P-08)", async () => {
    fakeServer({ incoming: [req({ otherName: null })] });
    render(<FriendsPage api="http://api" token={token} />);
    expect(await screen.findByText(/Name unbekannt möchte/)).toBeTruthy();
  });

  it("US-SOZ-01 creates a code and shows it once with its expiry", async () => {
    fakeServer();
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Einladungscode erzeugen" }));
    expect((await screen.findByLabelText("Dein Freundescode")).textContent).toBe(
      "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
    );
    expect(screen.getByText(/Einmal verwendbar, gültig bis 13\.10\.2026/)).toBeTruthy();
  });

  it("US-SOZ-01 sends a request with a code and lists it as waiting", async () => {
    const { calls } = fakeServer();
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.type(await screen.findByLabelText("Freundescode"), "ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Anfrage gesendet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/requests", body: { code: "ABCD-EFGH" } });
    expect(await screen.findByText("Wartet auf Antwort")).toBeTruthy();
  });

  it("US-SOZ-01 an empty code is refused before sending; a refused code shows its German text at the field (P-10)", async () => {
    const { calls } = fakeServer();
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText("Bitte gib den Freundescode ein.")).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.type(screen.getByLabelText("Freundescode"), "BAD");
    await userEvent.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(await screen.findByText(/Freundescode wurde schon benutzt/)).toBeTruthy();
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("US-SOZ-02 shows no collection data of a friend, only name and start (P-05)", async () => {
    fakeServer({ friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z" }] });
    render(<FriendsPage api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Freunde" });
    expect(list.textContent).toBe("Benbefreundet seit 06.10.2026Freundschaft beenden");
  });

  it("US-SOZ-03 ending a friendship asks first, says what it does and then removes the friend", async () => {
    const { calls } = fakeServer({
      friends: [{ id: "f1", name: "Ben", since: "2026-10-06T12:00:00.000Z" }],
    });
    render(<FriendsPage api="http://api" token={token} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Freundschaft mit Ben beenden" }),
    );
    expect(screen.getByText(/alle Freigaben gelten dann nicht mehr/)).toBeTruthy();
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(/alle Freigaben/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Freundschaft mit Ben beenden" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, beenden" }));
    expect(await screen.findByText(/Freundschaft mit Ben beendet/)).toBeTruthy();
    expect(calls[0]).toEqual({ path: "/friends/f1/end", body: {} });
    expect(await screen.findByText(/Noch keine Freunde/)).toBeTruthy();
  });
});

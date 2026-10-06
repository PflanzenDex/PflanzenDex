// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WishlistPage } from "../WishlistPage";

// US-WUN-05: from the purchase to the plant: "Exemplar anlegen" after "Gekauft" and in the history, the link state, and
// the action "Verwerfen".
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const candidate = {
  id: "w1",
  name: "Calathea orbifolia",
  german: "Korbmarante",
  title: "Korbmarante (Calathea orbifolia)",
  zone: { id: "z3", name: "Fenster 3" },
  stock: 1,
  zoneText: "Fenster 3 — 1 Pflanze",
  difficulty: 2,
  reasoning: null,
  image: null,
  priority: { kind: "thinnest", text: "Die Zone mit den wenigsten Pflanzen (1)." },
};
const candidates = (open: unknown[]) => ({
  candidates: open,
  zones: [],
  hint: { text: "Als Nächstes dran: Korbmarante.", nextAction: "Besorge diese Pflanze zuerst." },
  duplicates: [],
  duplicateHint: null,
  replenishment: {
    buffer: 2,
    zones: [],
    actions: { discover: false, suggestions: false },
    nextAction: null,
  },
});
const BOUGHT_HINT = {
  text: "„Korbmarante (Calathea orbifolia)“ ist als gekauft vermerkt.",
  nextAction: "Tippe auf „Exemplar anlegen“.",
};
const DISCARD_HINT = {
  text: "„Korbmarante (Calathea orbifolia)“ ist verworfen. Der Wunsch bleibt unter „Verworfen“ gespeichert.",
  nextAction: "Prüfe die übrigen Kandidaten.",
};
const history = (entries: { id: string; title: string; specimenId: string | null }[]) => ({
  bought: entries.map((e) => ({ ...e, name: e.title })),
  hint: {
    text: `${entries.length} Wünsche sind als gekauft vermerkt.`,
    nextAction: "Lege sie an.",
  },
});
const discardedOf = (titles: string[]) => ({
  discarded: titles.map((title, i) => ({ id: `d${i}`, name: title, title })),
  hint: {
    text: titles.length === 0 ? "Kein Wunsch ist verworfen." : "1 Wunsch ist verworfen.",
    nextAction: "Ein verworfener Wunsch bleibt gespeichert.",
  },
});

interface Setup {
  open?: unknown[];
  bought?: ReturnType<typeof history>;
  discarded?: ReturnType<typeof discardedOf>;
  refusal?: { status: number; code: string };
}
function server(setup: Setup = {}) {
  const state = {
    open: setup.open ?? [candidate],
    bought: setup.bought ?? history([]),
    discarded: setup.discarded ?? discardedOf([]),
  };
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/wishes/candidates") return response(200, candidates(state.open));
    if (path === "/wishes/bought") return response(200, state.bought);
    if (path === "/wishes/discarded") return response(200, state.discarded);
    if (init?.method === "POST" && path === "/wishes/w1/buy") {
      state.open = [];
      state.bought = history([{ id: "w1", title: candidate.title, specimenId: null }]);
      return response(200, {
        changed: true,
        wish: { id: "w1", status: "bought" },
        hint: BOUGHT_HINT,
      });
    }
    if (init?.method === "POST" && path === "/wishes/w1/discard") {
      if (setup.refusal)
        return response(setup.refusal.status, {
          error: { code: setup.refusal.code, text: "roh vom Server" },
        });
      state.open = [];
      state.discarded = discardedOf([candidate.title]);
      return response(200, {
        changed: true,
        wish: { id: "w1", status: "discarded" },
        hint: DISCARD_HINT,
      });
    }
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const posts = (f: ReturnType<typeof server>) =>
  f.mock.calls.filter(([, i]) => i?.method === "POST");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WUN-05 the way from the purchase to the specimen", () => {
  it("US-WUN-05 after 'Gekauft' the confirmation offers 'Exemplar anlegen' and hands the wish over", async () => {
    server();
    const onCreateSpecimen = vi.fn();
    render(<WishlistPage api="http://api" token={token} onCreateSpecimen={onCreateSpecimen} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Gekauft: / }));
    const status = (await screen.findByText(BOUGHT_HINT.text)).closest(
      '[role="status"]',
    ) as HTMLElement;
    await userEvent.click(within(status).getByRole("button", { name: "Exemplar anlegen" }));
    expect(onCreateSpecimen).toHaveBeenCalledWith({
      id: "w1",
      name: "Calathea orbifolia",
      title: "Korbmarante (Calathea orbifolia)",
    });
  });

  it("US-WUN-05 the history offers 'Exemplar anlegen' for a bought wish without a specimen", async () => {
    server({ open: [], bought: history([{ id: "w1", title: candidate.title, specimenId: null }]) });
    const onCreateSpecimen = vi.fn();
    render(<WishlistPage api="http://api" token={token} onCreateSpecimen={onCreateSpecimen} />);
    const list = await screen.findByRole("list", { name: "Gekaufte Wünsche" });
    await userEvent.click(
      within(list).getByRole("button", { name: `Exemplar anlegen: ${candidate.title}` }),
    );
    expect(onCreateSpecimen).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
  });

  it("US-WUN-05 a linked wish says so ('gekauft → Exemplar') and offers no second specimen", async () => {
    server({ open: [], bought: history([{ id: "w1", title: candidate.title, specimenId: "s1" }]) });
    render(<WishlistPage api="http://api" token={token} onCreateSpecimen={vi.fn()} />);
    const list = await screen.findByRole("list", { name: "Gekaufte Wünsche" });
    expect(list.textContent).toContain("Gekauft → Exemplar angelegt");
    expect(within(list).queryByRole("button")).toBeNull();
  });

  it("US-WUN-05 without a hand-over the page shows no 'Exemplar anlegen'", async () => {
    server({ open: [], bought: history([{ id: "w1", title: candidate.title, specimenId: null }]) });
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Gekaufte Wünsche" });
    expect(screen.queryByRole("button", { name: /Exemplar anlegen/ })).toBeNull();
  });
});

describe("US-WUN-05 'Verwerfen' sets a wish to discarded", () => {
  it("US-WUN-05 each open candidate offers 'Verwerfen'", async () => {
    server();
    render(<WishlistPage api="http://api" token={token} />);
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(
      within(item).getByRole("button", { name: `Verwerfen: ${candidate.title}` }),
    ).toBeTruthy();
  });

  it("US-WUN-05 'Verwerfen' asks first; 'Abbrechen' writes nothing", async () => {
    const f = server();
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Verwerfen: / }));
    expect(screen.getByText(/Wirklich verwerfen\?/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(posts(f)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Verwerfen: / })).toBeTruthy();
  });

  it("US-WUN-05 confirming sends the action with a repeat-guard key, says what happened and keeps the wish under 'Verworfen'", async () => {
    const f = server();
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Verwerfen: / }));
    await userEvent.click(
      screen.getByRole("button", { name: `Ja, verwerfen: ${candidate.title}` }),
    );
    const done = await screen.findByText(DISCARD_HINT.text);
    expect(done.closest('[role="status"]')?.textContent).toContain(DISCARD_HINT.nextAction);
    const sent = posts(f);
    expect(sent).toHaveLength(1);
    expect(new Headers(sent[0]?.[1]?.headers).get("Idempotency-Key")).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Verworfene Wünsche" });
    expect(within(list).getByText(candidate.title)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Verworfen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Verwerfen: / })).toBeNull();
  });

  it("US-WUN-05 without discarded wishes there is no 'Verworfen' section", async () => {
    server();
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("heading", { name: "Verworfen" })).toBeNull();
  });

  it("US-WUN-05 a refusal shows the German text of its code, never the raw server text (P-10)", async () => {
    server({ refusal: { status: 409, code: "wish.already_bought" } });
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Verwerfen: / }));
    await userEvent.click(screen.getByRole("button", { name: /^Ja, verwerfen: / }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("schon als gekauft vermerkt");
    expect(alert.textContent).not.toContain("roh vom Server");
  });
});

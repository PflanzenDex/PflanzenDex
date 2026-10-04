// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WishlistPage } from "./WishlistPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const zones = [
  { zoneId: "z2", name: "Lampe 2", count: 3 },
  { zoneId: "z3", name: "Fenster 3", count: 1 },
];
const candidate = (extra: Record<string, unknown> = {}) => ({
  id: "w1",
  name: "Calathea orbifolia",
  german: "Korbmarante",
  title: "Korbmarante (Calathea orbifolia)",
  zone: { id: "z3", name: "Fenster 3" },
  stock: 1,
  zoneText: "Fenster 3 — 1 Pflanze",
  difficulty: 2,
  reasoning: "Mag gleichmäßig feuchte Erde.",
  image: { url: "https://upload.example/c.jpg", source: "Wikimedia Commons" },
  priority: {
    kind: "thinnest",
    text: "Die Zone mit den wenigsten Pflanzen (1): hier ist am meisten Platz.",
  },
  ...extra,
});
const list = (
  candidates: unknown[],
  hint = { text: "Als Nächstes dran: Korbmarante.", nextAction: "Besorge diese Pflanze zuerst." },
) => ({
  candidates,
  zones,
  hint,
});

function fakeServer(initial: unknown, post?: () => Promise<Response>) {
  let current = initial;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/wishes/candidates") return response(200, current);
    if (path === "/wishes" && init?.method === "POST" && post) {
      const r = await post();
      if (r.ok) current = list([candidate({ id: "w2", name: "Neu", german: null, title: "Neu" })]);
      return r;
    }
    return response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WUN-01 page of the candidate list", () => {
  it("US-WUN-01 shows per candidate title, zone with stock, difficulty word, reasoning, picture with source and the why", async () => {
    fakeServer(list([candidate()]));
    render(<WishlistPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(
      within(item).getByRole("heading", { name: "Korbmarante (Calathea orbifolia)" }),
    ).toBeTruthy();
    expect(item.textContent).toContain("Fenster 3 — 1 Pflanze");
    expect(item.textContent).toContain("Mittel");
    expect(item.textContent).toContain("Mag gleichmäßig feuchte Erde.");
    expect(item.textContent).toContain("hier ist am meisten Platz");
    expect(item.textContent).toContain("Quelle: Wikimedia Commons");
    expect(within(item).getByRole("img").getAttribute("src")).toBe("https://upload.example/c.jpg");
    expect(screen.getByText("Besorge diese Pflanze zuerst.")).toBeTruthy();
  });

  it("US-WUN-01 keeps the order of the server and says unknown instead of guessing", async () => {
    fakeServer(
      list([
        candidate(),
        candidate({
          id: "w9",
          name: "Ficus",
          german: null,
          title: "Ficus",
          zone: null,
          stock: null,
          zoneText: "Ziel-Zone unbekannt",
          difficulty: null,
          reasoning: null,
          image: null,
          priority: {
            kind: "zone_unknown",
            text: "Ziel-Lichtzone unbekannt: dieser Wunsch zählt noch nicht mit.",
          },
        }),
      ]),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findAllByRole("listitem");
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles.slice(0, 2)).toEqual(["Korbmarante (Calathea orbifolia)", "Ficus"]);
    const second = screen.getAllByRole("listitem")[1] as HTMLElement;
    expect(second.textContent).toContain("Ziel-Zone unbekannt");
    expect(second.textContent).toContain("Schwierigkeit: unbekannt");
    expect(second.textContent).toContain("Kein Bild");
    expect(second.querySelector("img")).toBeNull();
  });

  it("US-WUN-01 without open candidates says so and what to do next", async () => {
    fakeServer(
      list([], {
        text: "Keine offenen Kandidaten in der Wunschliste.",
        nextAction: "Erfasse einen Wunsch mit Ziel-Lichtzone.",
      }),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByText("Keine offenen Kandidaten in der Wunschliste.");
    expect(screen.getByText("Erfasse einen Wunsch mit Ziel-Lichtzone.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("US-WUN-01 shows a load error with a way to retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByText("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: /Erneut laden/ })).toBeTruthy();
  });
});

describe("US-WUN-01 recording a wish", () => {
  const fill = async (name: string) => {
    await screen.findByRole("heading", { name: "Wunsch erfassen" });
    await userEvent.type(screen.getByLabelText("Name"), name);
  };

  it("US-WUN-01 sends the wish with the chosen zone and difficulty, reloads the list and confirms", async () => {
    const fetchFn = fakeServer(list([candidate()]), () => response(201, { wish: { id: "w2" } }));
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await userEvent.selectOptions(screen.getByLabelText("Ziel-Lichtzone"), "z2");
    await userEvent.selectOptions(screen.getByLabelText("Schwierigkeit"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    await screen.findByText(/Wunsch „Neu“ gespeichert/);
    const post = fetchFn.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      name: "Neu",
      targetZoneId: "z2",
      difficulty: 3,
    });
    expect((post?.[1]?.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(
      (await screen.findAllByRole("heading", { level: 2 })).map((h) => h.textContent),
    ).toContain("Neu");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  it("US-WUN-01 keeps a refusal visible with its text and shows no success", async () => {
    fakeServer(list([candidate()]), () =>
      response(409, {
        error: { code: "wish.name_taken", text: "Einen Wunsch mit diesem Namen gibt es schon." },
      }),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("gibt es schon");
    expect(screen.queryByText(/gespeichert/)).toBeNull();
  });

  it("US-WUN-01 refuses an empty name and a picture without source before sending", async () => {
    const fetchFn = fakeServer(list([candidate()]), () => response(201, { wish: {} }));
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByRole("heading", { name: "Wunsch erfassen" });
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Name");
    await userEvent.type(screen.getByLabelText("Name"), "Neu");
    await userEvent.type(screen.getByLabelText("Bild-Adresse (https)"), "https://x.example/a.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Quelle");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});

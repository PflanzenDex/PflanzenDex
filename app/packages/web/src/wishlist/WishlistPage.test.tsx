// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  duplicates: [],
  duplicateHint: null,
  replenishment: {
    buffer: 2,
    zones: [],
    actions: { discover: false, suggestions: false },
    nextAction: null,
  },
});

const NONE_BOUGHT = {
  bought: [],
  hint: { text: "Noch kein Wunsch ist als gekauft vermerkt.", nextAction: "Tippe auf „Gekauft“." },
};
const NONE_DISCARDED = {
  discarded: [],
  hint: { text: "Kein Wunsch ist verworfen.", nextAction: "Tippe auf „Verwerfen“." },
};
/** The list of discarded wishes (US-WUN-05) is loaded with the page; stubs that know nothing else answer it empty. */
const fallback = (url: unknown) =>
  String(url).endsWith("/wishes/discarded") ? response(200, NONE_DISCARDED) : response(404, {});

/** The histories of bought (US-WUN-03) and discarded (US-WUN-05) wishes are loaded with the list; this answers them for stubs that know one body. */
const boughtOr = (url: unknown, body: unknown) =>
  response(
    200,
    String(url).endsWith("/wishes/bought")
      ? NONE_BOUGHT
      : String(url).endsWith("/wishes/discarded")
        ? NONE_DISCARDED
        : body,
  );

function fakeServer(initial: unknown, post?: () => Promise<Response>) {
  let current = initial;
  const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/wishes/candidates") return response(200, current);
    if (path === "/wishes/bought") return response(200, NONE_BOUGHT);
    if (path === "/wishes" && init?.method === "POST" && post) {
      const r = await post();
      if (r.ok) current = list([candidate({ id: "w2", name: "Neu", german: null, title: "Neu" })]);
      return r;
    }
    return fallback(url);
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
    // P-05: no remote picture is loaded in the keeper's browser; only an explicit link to the address (until US-WUN-04).
    expect(item.querySelector("img")).toBeNull();
    const link = within(item).getByRole("link", { name: "Bild ansehen (öffnet extern)" });
    expect(link.getAttribute("href")).toBe("https://upload.example/c.jpg");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
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

  it("US-WUN-02 shows the replenishment warning of the server above the list", async () => {
    fakeServer({
      ...list([candidate()]),
      replenishment: {
        buffer: 2,
        zones: [
          {
            zoneId: "z3",
            name: "Fenster 3",
            open: 1,
            text: "Nachschub nötig: Fenster 3 (1 offener Kandidat)",
          },
        ],
        actions: { discover: false, suggestions: false },
        nextAction: "Erfasse einen Wunsch mit Ziel-Zone Fenster 3.",
      },
    });
    render(<WishlistPage api="http://api" token={token} />);
    expect(await screen.findByText("Nachschub nötig: Fenster 3 (1 offener Kandidat)")).toBeTruthy();
    expect(screen.getByText("Erfasse einen Wunsch mit Ziel-Zone Fenster 3.")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
  });
});

describe("US-QS-07 · DS-09 wishlist on the data layer", () => {
  it("US-QS-07 · DS-09 pending shows the skeleton with the one loading status", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<WishlistPage api="http://api" token={token} />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Wunschliste wird geladen");
  });

  it("US-QS-07 · DS-09 a domain error shows the text and 'Erneut versuchen' loads again", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        ++attempt === 1
          ? response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } })
          : boughtOr(url, list([candidate()])),
      ),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByText("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Korbmarante (Calathea orbifolia)")).toBeTruthy();
  });

  it("US-QS-07 · DS-09 offline after an earlier load shows the cached list with the note", async () => {
    let offline = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (offline) throw new TypeError("Failed to fetch");
        return boughtOr(url, list([candidate()]));
      }),
    );
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>umschalten</button>
          {open && <WishlistPage api="http://api" token={token} />}
        </>
      );
    }
    render(<Toggle />);
    await screen.findByText("Korbmarante (Calathea orbifolia)");
    offline = true;
    await userEvent.click(screen.getByRole("button", { name: "umschalten" }));
    await userEvent.click(screen.getByRole("button", { name: "umschalten" }));
    expect(await screen.findByText("Offline - zuletzt geladene Daten")).toBeTruthy();
    expect(screen.getByText("Korbmarante (Calathea orbifolia)")).toBeTruthy();
  });

  it("US-QS-07 · DS-09 a saved wish refreshes the list without a page reload", async () => {
    fakeServer(list([candidate()]), () => response(201, { wish: { id: "w2" } }));
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByText("Korbmarante (Calathea orbifolia)");
    await userEvent.type(screen.getByLabelText("Name"), "Neu");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    expect(await screen.findByRole("heading", { name: "Neu" })).toBeTruthy();
    expect(screen.queryByText("Korbmarante (Calathea orbifolia)")).toBeNull();
  });
});

describe("US-WUN-01 no remote picture is loaded (P-05)", () => {
  it("US-WUN-01 an address that is not https is not linked and nothing is embedded", async () => {
    fakeServer(list([candidate({ image: { url: "javascript:alert(1)", source: "Irgendwer" } })]));
    render(<WishlistPage api="http://api" token={token} />);
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector("a")).toBeNull();
    expect(item.textContent).toContain("Kein Bild");
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

  const refusal = (status: number, code: string, text: string, details?: unknown) => () =>
    response(status, { error: { code, text, ...(details ? { details } : {}) } });
  const save = () => userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
  const describedText = (el: HTMLElement) =>
    (el.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");

  it("US-WUN-01 marks the name field when the name is taken: text next to it, focus, value kept, no success", async () => {
    fakeServer(
      list([candidate()]),
      refusal(409, "wish.name_taken", "Einen Wunsch mit diesem Namen gibt es schon."),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await save();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    await vi.waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(name)).toContain("gibt es schon");
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe("Neu");
    expect(screen.queryByText(/gespeichert/)).toBeNull();
    expect(screen.getByLabelText("Schwierigkeit").getAttribute("aria-invalid")).not.toBe("true");
  });

  it("US-WUN-01 marks the zone field when the server says the zone is not the keeper's", async () => {
    fakeServer(
      list([candidate()]),
      refusal(404, "light_zone.not_found", "Diese Lichtzone gibt es nicht."),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await userEvent.selectOptions(screen.getByLabelText("Ziel-Lichtzone"), "z2");
    await save();
    const zone = screen.getByLabelText("Ziel-Lichtzone") as HTMLSelectElement;
    await vi.waitFor(() => expect(zone.getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(zone)).toContain("gibt es nicht");
    expect(document.activeElement).toBe(zone);
    expect(zone.value).toBe("z2");
  });

  it("US-WUN-01 marks the field the server names in the details", async () => {
    fakeServer(
      list([candidate()]),
      refusal(422, "input.invalid", "Eine Eingabe ist ungültig.", [
        { field: "imageUrl", code: "input.invalid" },
      ]),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await save();
    const url = screen.getByLabelText("Bild-Adresse (https)");
    await vi.waitFor(() => expect(url.getAttribute("aria-invalid")).toBe("true"));
    expect(document.activeElement).toBe(url);
  });

  it("US-WUN-01 a refusal that names no field stays in an alert that takes the focus", async () => {
    fakeServer(list([candidate()]), refusal(500, "system.unexpected", "NullPointer at line 3"));
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await save();
    const alert = await screen.findByRole("alert");
    // DS-49: the German text of the error code, never the raw server text.
    expect(alert.textContent).toContain("unerwarteter Fehler");
    expect(alert.textContent).not.toContain("NullPointer");
    await vi.waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).not.toBe("true");
  });

  it("US-WUN-01 refuses an empty name before sending: field marked, described, focused", async () => {
    const fetchFn = fakeServer(list([candidate()]), () => response(201, { wish: {} }));
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByRole("heading", { name: "Wunsch erfassen" });
    await save();
    const name = screen.getByLabelText("Name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(name)).toContain("Name");
    await vi.waitFor(() => expect(document.activeElement).toBe(name));
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("US-WUN-01 refuses a picture address without source: the source field is marked and focused, values kept", async () => {
    const fetchFn = fakeServer(list([candidate()]), () => response(201, { wish: {} }));
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await userEvent.type(screen.getByLabelText("Bild-Adresse (https)"), "https://x.example/a.jpg");
    await save();
    const source = screen.getByLabelText("Bildquelle");
    expect(source.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(source)).toContain("Quelle");
    await vi.waitFor(() => expect(document.activeElement).toBe(source));
    expect((screen.getByLabelText("Bild-Adresse (https)") as HTMLInputElement).value).toBe(
      "https://x.example/a.jpg",
    );
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Neu");
    expect(fetchFn.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("US-WUN-01 refuses an address that is not https and one with credentials on the address field", async () => {
    fakeServer(list([candidate()]));
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await userEvent.type(screen.getByLabelText("Bildquelle"), "Quelle");
    const url = screen.getByLabelText("Bild-Adresse (https)");
    await userEvent.type(url, "http://x.example/a.jpg");
    await save();
    expect(url.getAttribute("aria-invalid")).toBe("true");
    await userEvent.clear(url);
    await userEvent.type(url, "https://me:pw@x.example/a.jpg");
    await save();
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(url)).toContain("https://");
  });

  it("US-WUN-01 a field loses its mark again when the next input is fine", async () => {
    fakeServer(list([candidate()]), () => response(201, { wish: { id: "w2" } }));
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByRole("heading", { name: "Wunsch erfassen" });
    await save();
    const name = screen.getByLabelText("Name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await userEvent.type(name, "Neu");
    await save();
    await screen.findByText(/gespeichert/);
    expect(name.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("US-WUN-01 a server refusal of a field disappears as soon as that field is edited, without moving the focus", async () => {
    fakeServer(
      list([candidate()]),
      refusal(409, "wish.name_taken", "Einen Wunsch mit diesem Namen gibt es schon."),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await save();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    await vi.waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    await userEvent.type(name, "x");
    expect(name.getAttribute("aria-invalid")).not.toBe("true");
    expect(screen.queryByText(/gibt es schon/)).toBeNull();
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe("Neux");
  });

  it("US-WUN-01 editing another field keeps the server refusal of the name visible", async () => {
    fakeServer(
      list([candidate()]),
      refusal(409, "wish.name_taken", "Einen Wunsch mit diesem Namen gibt es schon."),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await fill("Neu");
    await save();
    const name = screen.getByLabelText("Name");
    await vi.waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    await userEvent.type(screen.getByLabelText("Deutscher Name (optional)"), "Ein");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/gibt es schon/)).toBeTruthy();
  });
});

describe("US-WUN-01 · DS-48 states and primitives", () => {
  it("US-WUN-01 · DS-52 while loading, a skeleton of the page stands in with one status and hidden blocks", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = render(<WishlistPage api="http://api" token={token} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Wunschliste wird geladen");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("US-WUN-01 · DS-26 the empty list offers the next action: it takes the keeper to the form", async () => {
    fakeServer(
      list([], {
        text: "Keine offenen Kandidaten in der Wunschliste.",
        nextAction: "Erfasse einen Wunsch mit Ziel-Lichtzone.",
      }),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByText("Keine offenen Kandidaten in der Wunschliste.");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch erfassen" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("US-WUN-01 · DS-50 the save button is disabled while the write runs, so a double tap writes once", async () => {
    let release: (r: Response) => void = () => {};
    const fetchFn = fakeServer(
      list([candidate()]),
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findByRole("heading", { name: "Wunsch erfassen" });
    await userEvent.type(screen.getByLabelText("Name"), "Neu");
    await userEvent.click(screen.getByRole("button", { name: "Wunsch speichern" }));
    const busy = (await screen.findByRole("button", { name: /Speichert/ })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    release(new Response(JSON.stringify({ wish: { id: "w2" } }), { status: 201 }));
    await screen.findByText(/gespeichert/);
    expect(fetchFn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

describe("US-WUN-03 record a purchase on the page", () => {
  const BOUGHT_HINT = {
    text: "„Korbmarante (Calathea orbifolia)“ ist als gekauft vermerkt. Der Wunsch steht nicht mehr in der Wunschliste, sondern unter „Gekauft“.",
    nextAction: "Lege die Pflanze jetzt als Exemplar in deiner Sammlung an.",
  };
  const historyOf = (titles: string[]) => ({
    bought: titles.map((title, i) => ({ id: `b${i}`, name: title, title, specimenId: null })),
    hint: {
      text: `${titles.length} Wünsche sind als gekauft vermerkt.`,
      nextAction:
        "Fehlt eine dieser Pflanzen noch in deiner Sammlung, lege sie dort als Exemplar an.",
    },
  });

  /** A server that moves the wish from the list into the history on "buy", or refuses with `refusal`. */
  function buyServer(refusal?: { status: number; code: string }) {
    let bought = false;
    const empty = list([], {
      text: "Keine offenen Kandidaten in der Wunschliste.",
      nextAction: "Erfasse einen Wunsch.",
    });
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/wishes/candidates") return response(200, bought ? empty : list([candidate()]));
      if (path === "/wishes/bought")
        return response(
          200,
          bought ? historyOf(["Korbmarante (Calathea orbifolia)"]) : NONE_BOUGHT,
        );
      if (path === "/wishes/w1/buy" && init?.method === "POST") {
        if (refusal)
          return response(refusal.status, {
            error: { code: refusal.code, text: "roh vom Server" },
          });
        bought = true;
        return response(200, {
          changed: true,
          wish: { id: "w1", status: "bought" },
          hint: BOUGHT_HINT,
        });
      }
      return fallback(url);
    });
    vi.stubGlobal("fetch", fetchFn);
    return fetchFn;
  }

  it("US-WUN-03 each open candidate offers 'Gekauft'", async () => {
    buyServer();
    render(<WishlistPage api="http://api" token={token} />);
    const item = (await screen.findAllByRole("listitem"))[0] as HTMLElement;
    expect(
      within(item).getByRole("button", { name: "Gekauft: Korbmarante (Calathea orbifolia)" }),
    ).toBeTruthy();
  });

  it("US-WUN-03 'Gekauft' sends the purchase with a repeat-guard key, hides the candidate and keeps it under 'Gekauft'", async () => {
    const fetchFn = buyServer();
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Gekauft: / }));
    const done = await screen.findByText(BOUGHT_HINT.text);
    const status = done.closest('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain(BOUGHT_HINT.nextAction);
    await vi.waitFor(() => expect(document.activeElement).toBe(status));
    const posts = fetchFn.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(new Headers(posts[0]?.[1]?.headers).get("Idempotency-Key")).toBeTruthy();
    expect(await screen.findByText("Keine offenen Kandidaten in der Wunschliste.")).toBeTruthy();
    const history = screen.getByRole("list", { name: "Gekaufte Wünsche" });
    expect(within(history).getByText("Korbmarante (Calathea orbifolia)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gekauft" })).toBeTruthy();
    expect(screen.getByText(/lege sie dort als Exemplar an/)).toBeTruthy();
  });

  it("US-WUN-03 without bought wishes there is no 'Gekauft' section", async () => {
    buyServer();
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("heading", { name: "Gekauft" })).toBeNull();
  });

  it("US-WUN-03 a refusal shows the German text of its code, never the raw server text (P-10)", async () => {
    buyServer({ status: 409, code: "wish.not_open" });
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /^Gekauft: / }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("nicht mehr offen");
    expect(alert.textContent).not.toContain("roh vom Server");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("US-WUN-03 · DS-50 'Gekauft' is disabled while the write runs, so a double tap writes once", async () => {
    let release: (r: Response) => void = () => {};
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/wishes/candidates") return response(200, list([candidate()]));
      if (path === "/wishes/bought") return response(200, NONE_BOUGHT);
      if (init?.method === "POST") return new Promise<Response>((resolve) => (release = resolve));
      return fallback(url);
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<WishlistPage api="http://api" token={token} />);
    const button = (await screen.findByRole("button", { name: /^Gekauft: / })) as HTMLButtonElement;
    await userEvent.click(button);
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    await userEvent.click(button);
    release(
      new Response(JSON.stringify({ changed: true, wish: { id: "w1" }, hint: BOUGHT_HINT }), {
        status: 200,
      }),
    );
    await screen.findByText(BOUGHT_HINT.text);
    expect(fetchFn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
});

describe("FR-WUN-06 #303 repair of duplicate wish names on the page", () => {
  const HINT = {
    text: "Diese Wünsche heißen gleich wie ein anderer: umbenennen oder zusammenführen.",
    nextAction: "Benenne jeden dieser Wünsche um oder lösche ihn.",
  };
  const withDuplicates = () => ({
    ...list([candidate()]),
    duplicates: [{ id: "w9", name: "Cafe", title: "Cafe" }],
    duplicateHint: HINT,
  });

  /** Serves the list with one duplicate until a repair succeeds, then without; or refuses with `refusal`. */
  function repairServer(refusal?: { status: number; code: string }) {
    let fixed = false;
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/wishes/candidates")
        return response(200, fixed ? list([candidate()]) : withDuplicates());
      if (path === "/wishes/bought") return response(200, NONE_BOUGHT);
      if (init?.method === "POST" && /^\/wishes\/w9\/(rename|remove-duplicate)$/.test(path)) {
        if (refusal)
          return response(refusal.status, {
            error: { code: refusal.code, text: "roh vom Server" },
          });
        fixed = true;
        return response(200, {
          wish: { id: "w9", name: "Cafe au lait" },
          removed: { id: "w9" },
          hint: { text: "Der Wunsch heißt jetzt „Cafe au lait“.", nextAction: "Prüfe weitere." },
        });
      }
      return fallback(url);
    });
    vi.stubGlobal("fetch", fetchFn);
    return fetchFn;
  }
  const posts = (f: ReturnType<typeof repairServer>) =>
    f.mock.calls.filter(([, init]) => init?.method === "POST");

  it("FR-WUN-06 #303 shows the hint and each duplicate with its actions, above the candidates", async () => {
    repairServer();
    render(<WishlistPage api="http://api" token={token} />);
    const section = await screen.findByRole("region", { name: "Doppelte Namen" });
    expect(within(section).getByText(HINT.text)).toBeTruthy();
    expect(within(section).getByText(HINT.nextAction)).toBeTruthy();
    expect(within(section).getByLabelText("Neuer Name für Cafe")).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Umbenennen: Cafe" })).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Löschen: Cafe" })).toBeTruthy();
  });

  it("FR-WUN-06 #303 without duplicates there is no such section", async () => {
    fakeServer(list([candidate()]));
    render(<WishlistPage api="http://api" token={token} />);
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("region", { name: "Doppelte Namen" })).toBeNull();
  });

  it("FR-WUN-06 #303 rename sends the new name with a repeat-guard key and the hint goes away", async () => {
    const f = repairServer();
    render(<WishlistPage api="http://api" token={token} />);
    const field = await screen.findByLabelText("Neuer Name für Cafe");
    await userEvent.clear(field);
    await userEvent.type(field, "Cafe au lait");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen: Cafe" }));
    await screen.findByText(/heißt jetzt/);
    expect(posts(f)).toHaveLength(1);
    const [url, init] = posts(f)[0] ?? [];
    expect(String(url)).toBe("http://api/wishes/w9/rename");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Cafe au lait" });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Doppelte Namen" })).toBeNull();
  });

  it("FR-WUN-06 #303 a blank name sends nothing and says so", async () => {
    const f = repairServer();
    render(<WishlistPage api="http://api" token={token} />);
    const field = await screen.findByLabelText("Neuer Name für Cafe");
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen: Cafe" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Name");
    expect(posts(f)).toHaveLength(0);
  });

  it("FR-WUN-06 #303 a taken name shows the German text of its code, never the raw server text (P-10)", async () => {
    repairServer({ status: 409, code: "wish.name_taken" });
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Umbenennen: Cafe" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Einen Wunsch mit diesem Namen gibt es schon");
    expect(alert.textContent).not.toContain("roh vom Server");
    expect(screen.getByRole("region", { name: "Doppelte Namen" })).toBeTruthy();
  });

  it("FR-WUN-06 #303 delete asks first and sends nothing until it is confirmed", async () => {
    const f = repairServer();
    render(<WishlistPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: "Löschen: Cafe" }));
    expect(screen.getByText(/Wirklich löschen/)).toBeTruthy();
    expect(posts(f)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(/Wirklich löschen/)).toBeNull();
    expect(posts(f)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Löschen: Cafe" }));
    await userEvent.click(screen.getByRole("button", { name: "Ja, löschen: Cafe" }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(String(posts(f)[0]?.[0])).toBe("http://api/wishes/w9/remove-duplicate");
    await vi.waitFor(() =>
      expect(screen.queryByRole("region", { name: "Doppelte Namen" })).toBeNull(),
    );
  });

  it("FR-WUN-06 #303 · DS-50 the actions wait while a write runs, so a double tap writes once", async () => {
    let release: (r: Response) => void = () => {};
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/wishes/candidates") return response(200, withDuplicates());
      if (path === "/wishes/bought") return response(200, NONE_BOUGHT);
      if (init?.method === "POST") return new Promise<Response>((resolve) => (release = resolve));
      return fallback(url);
    });
    vi.stubGlobal("fetch", fetchFn);
    render(<WishlistPage api="http://api" token={token} />);
    const button = (await screen.findByRole("button", {
      name: "Umbenennen: Cafe",
    })) as HTMLButtonElement;
    await userEvent.click(button);
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    await userEvent.click(button);
    release(
      new Response(JSON.stringify({ wish: {}, hint: { text: "ok", nextAction: "" } }), {
        status: 200,
      }),
    );
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1),
    );
  });
});

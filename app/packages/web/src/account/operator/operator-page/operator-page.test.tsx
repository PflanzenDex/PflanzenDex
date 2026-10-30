// @vitest-environment jsdom
import type { OperatorOverview } from "@pflanzendex/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAmount } from "../../schemas";
import { OperatorPage } from "./operator-page";

const token = async () => "tok";
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const overview = (over: Partial<OperatorOverview> = {}): OperatorOverview => ({
  accounts: 12,
  activeAccounts: 5,
  activeWindowDays: 30,
  cost: null,
  costPerUser: { known: false, reason: "no_figure" },
  invitationOnly: false,
  invitations: [],
  ...over,
});

type Handler = (url: string, init: RequestInit) => Promise<Response>;
let current: OperatorOverview;
let calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[];

function serve(extra: Handler = () => json(404, {})) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init = {}) => {
      const path = String(input).replace("http://api", "");
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body, headers: init.headers as Record<string, string> });
      if (path === "/operator/overview") return json(200, current);
      if (path === "/operator/introduction")
        return json(200, {
          windowDays: 90,
          settleDays: 7,
          minAccounts: 5,
          accounts: 0,
          steps: { value: 2, targetMet: true },
          medianSecondsToFirstPlant: { known: false, reason: "too_few_accounts" },
          withoutPlantPercent: { known: false, reason: "too_few_accounts" },
        });
      return extra(path, init);
    }),
  );
}

beforeEach(() => {
  current = overview();
  serve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The page in a router, because each topic's layer lives in the address (`?sheet=`, US-QS-15). */
const show = () =>
  render(
    <MemoryRouter>
      <OperatorPage api="http://api" token={token} />
    </MemoryRouter>,
  );

const open = async () => {
  show();
  await screen.findByRole("heading", { name: "Betreiber" });
  // The topics arrive through the data layer after the heading.
  await screen.findByRole("button", { name: /^Zahlen/ });
};

/** Opens one topic as its layer, the way a person does: its row names the topic and shows its value (US-QS-15). */
const topic = async (name: RegExp) => {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
};

const numbers = async () => {
  await open();
  await topic(/^Zahlen/);
  return screen.getByRole("region", { name: "Zahlen" });
};

const fact = (facts: HTMLElement, label: string) =>
  within(facts).getByText(label).nextElementSibling?.textContent ?? "";

describe("US-ACC-05 operator area: counts, no content", () => {
  it("US-ACC-05 shows accounts and active users, and the cost per user as unknown (P-08)", async () => {
    const facts = await numbers();
    expect(fact(facts, "Konten")).toBe("12");
    expect(fact(facts, "Aktive Nutzer (letzte 30 Tage)")).toBe("5");
    expect(fact(facts, "Kosten pro Nutzer")).toMatch(/^unbekannt/);
    expect(facts.textContent).not.toMatch(/€|EUR|\$/);
  });

  it("US-ACC-05 shows no email, name or plant data of any account", async () => {
    current = overview({
      invitations: [
        {
          id: "i1",
          createdAt: "2026-10-04T10:00:00.000Z",
          expiresAt: "2026-10-11T10:00:00.000Z",
          redeemedAt: null,
          status: "open",
        },
      ],
    });
    serve();
    await open();
    expect(document.body.textContent).not.toMatch(/@|Pflanze|Art /);
  });

  it("US-ACC-05 a plant keeper's refusal (403 access.denied) is shown with a way to reload (P-09, P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        json(403, { error: { code: "access.denied", text: "Darauf hast du keinen Zugriff." } }),
      ),
    );
    show();
    expect(await screen.findByText("Darauf hast du keinen Zugriff.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
  });
});

describe("US-ACC-05 monthly cost and cost per user", () => {
  it("US-ACC-05 without a figure: cost per user unknown with what to do (P-08, P-09)", async () => {
    const facts = await numbers();
    expect(fact(facts, "Monatliche Kosten")).toBe("nicht eingetragen");
    expect(fact(facts, "Kosten pro Nutzer")).toBe("unbekannt: trage die Kosten eines Monats ein");
  });

  it("US-ACC-05 with a figure: amount per user with month and 'manuell eingetragen'", async () => {
    current = overview({
      cost: { amountCents: 4999, currency: "EUR", month: "2026-09" },
      costPerUser: {
        known: true,
        amountCents: 1000,
        currency: "EUR",
        month: "2026-09",
        source: "manual",
      },
    });
    const facts = await numbers();
    expect(fact(facts, "Monatliche Kosten")).toMatch(/^49,99\s€ \(September 2026\)$/);
    expect(fact(facts, "Kosten pro Nutzer")).toMatch(
      /^10,00\s€ \(September 2026, manuell eingetragen\)$/,
    );
  });

  it("US-ACC-05 a figure without active users: cost per user unknown with the reason", async () => {
    current = overview({
      activeAccounts: 0,
      cost: { amountCents: 4999, currency: "EUR", month: "2026-09" },
      costPerUser: { known: false, reason: "no_active_accounts" },
    });
    const facts = await numbers();
    expect(fact(facts, "Kosten pro Nutzer")).toBe("unbekannt: es gibt noch keine aktiven Nutzer");
  });

  it("US-ACC-05 saving sends the amount in cents with a repeat-guard key and reloads the numbers", async () => {
    serve((path, init) =>
      path === "/operator/cost" && init.method === "PUT"
        ? json(200, JSON.parse(String(init.body)))
        : json(404, {}),
    );
    await open();
    await topic(/^Monatliche Kosten/);
    const amount = screen.getByLabelText("Betrag");
    await userEvent.type(amount, "1.234,5");
    const month = screen.getByLabelText("Monat");
    await userEvent.clear(month);
    await userEvent.type(month, "2026-09");
    await userEvent.click(screen.getByRole("button", { name: "Kosten speichern" }));
    expect(await screen.findByText("Monatliche Kosten gespeichert.")).toBeTruthy();
    const writes = calls.filter((c) => c.method === "PUT");
    expect(writes.map((w) => [w.path, w.body])).toEqual([
      ["/operator/cost", { amountCents: 123450, currency: "EUR", month: "2026-09" }],
    ]);
    expect(
      writes[0]?.headers["idempotency-key"] ?? writes[0]?.headers["Idempotency-Key"],
    ).toBeTruthy();
    expect(calls.filter((c) => c.path === "/operator/overview").length).toBe(2);
  });

  it("US-ACC-05 an invalid amount or currency is refused before sending, with what to do (P-10)", async () => {
    await open();
    await topic(/^Monatliche Kosten/);
    await userEvent.type(screen.getByLabelText("Betrag"), "12,345");
    await userEvent.click(screen.getByRole("button", { name: "Kosten speichern" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/zum Beispiel 12,50/);
    await userEvent.clear(screen.getByLabelText("Betrag"));
    await userEvent.type(screen.getByLabelText("Betrag"), "12,50");
    await userEvent.clear(screen.getByLabelText("Währung"));
    await userEvent.type(screen.getByLabelText("Währung"), "E1");
    await userEvent.click(screen.getByRole("button", { name: "Kosten speichern" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/drei Buchstaben/);
    expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("US-ACC-05 a refusal of the server (future month) stays visible", async () => {
    serve(() =>
      json(400, {
        error: {
          code: "operator_cost.month_in_future",
          text: "Dieser Monat liegt in der Zukunft. Trage die Kosten eines Monats ein, der schon begonnen hat.",
        },
      }),
    );
    await open();
    await topic(/^Monatliche Kosten/);
    await userEvent.type(screen.getByLabelText("Betrag"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Kosten speichern" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Zukunft/);
  });

  it.each([
    ["12,50", 1250],
    ["1.234,5", 123450],
    ["1234.50", 123450],
    ["0", 0],
    [" 7 ", 700],
    ["1000000", 100000000],
    ["12,345", null],
    ["-3", null],
    ["abc", null],
    ["1000000,01", null],
    ["", null],
  ])("US-ACC-05 reads the amount %j as %j cents", (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });
});

describe("US-ACC-05 registration mode", () => {
  it("US-ACC-05 says in words whether registration is open", async () => {
    await open();
    const dialog = await topic(/^Registrierung/);
    expect(within(dialog).getByText("offen für alle")).toBeTruthy();
    cleanup();
    current = overview({ invitationOnly: true });
    serve();
    await open();
    const again = await topic(/^Registrierung/);
    expect(within(again).getByText("nur mit Einladungscode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Für alle öffnen" })).toBeTruthy();
  });

  it("US-ACC-05 switching on sends one write with a repeat-guard key and shows the new state", async () => {
    let answer: () => void = () => undefined;
    serve(
      (path, init) =>
        new Promise<Response>((resolve) => {
          if (path !== "/operator/registration" || init.method !== "PUT")
            return resolve(new Response("{}", { status: 404 }));
          answer = () => {
            current = overview({ invitationOnly: true });
            resolve(new Response(JSON.stringify({ invitationOnly: true }), { status: 200 }));
          };
        }),
    );
    await open();
    const dialog = await topic(/^Registrierung/);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Nur mit Einladungscode erlauben" });
    await user.dblClick(button);
    answer();
    await within(dialog).findByText("nur mit Einladungscode");
    const writes = calls.filter((c) => c.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({ invitationOnly: true });
    expect(writes[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Registrierung/);
  });
});

describe("US-ACC-05 invitation codes", () => {
  const created = {
    id: "i9",
    code: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
    expiresAt: "2026-10-11T10:00:00.000Z",
  };

  it("US-ACC-05 creates a code for 7 days by default and shows it once, with the expiry", async () => {
    serve(async (path, init) => {
      if (path === "/operator/invitations" && init.method === "POST") return json(201, created);
      return json(404, {});
    });
    await open();
    await topic(/^Einladungscodes/);
    const user = userEvent.setup();
    expect((screen.getByLabelText("Gültig für (Tage)") as HTMLInputElement).value).toBe("7");
    await user.click(screen.getByRole("button", { name: "Code erstellen" }));
    const box = await screen.findByRole("region", { name: "Neuer Einladungscode" });
    expect(within(box).getByText(created.code)).toBeTruthy();
    expect(box.textContent).toMatch(/nur jetzt/);
    expect(box.textContent).toMatch(/gültig bis/i);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ validForDays: 7 });
  });

  it("US-ACC-05 takes the chosen validity and refuses a value outside 1 to 30 before sending", async () => {
    serve(async () => json(201, created));
    await open();
    await topic(/^Einladungscodes/);
    const user = userEvent.setup();
    const days = screen.getByLabelText("Gültig für (Tage)") as HTMLInputElement;
    expect(days.min).toBe("1");
    expect(days.max).toBe("30");
    await user.clear(days);
    await user.type(days, "31");
    await user.click(screen.getByRole("button", { name: "Code erstellen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/1 und 30/);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await user.clear(days);
    await user.type(days, "3");
    await user.click(screen.getByRole("button", { name: "Code erstellen" }));
    await screen.findByRole("region", { name: "Neuer Einladungscode" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ validForDays: 3 });
  });

  it("US-ACC-05 a refusal of the server stays visible and no code is shown", async () => {
    serve(async () =>
      json(403, { error: { code: "access.denied", text: "Darauf hast du keinen Zugriff." } }),
    );
    await open();
    await topic(/^Einladungscodes/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Code erstellen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Darauf hast du keinen Zugriff.");
    expect(screen.queryByRole("region", { name: "Neuer Einladungscode" })).toBeNull();
  });

  it("US-ACC-05 lists invitations with a visible state in words, never a code", async () => {
    current = overview({
      invitations: [
        {
          id: "a",
          createdAt: "2026-10-04T10:00:00.000Z",
          expiresAt: "2026-10-11T10:00:00.000Z",
          redeemedAt: null,
          status: "open",
        },
        {
          id: "b",
          createdAt: "2026-10-03T10:00:00.000Z",
          expiresAt: "2026-10-10T10:00:00.000Z",
          redeemedAt: "2026-10-04T08:00:00.000Z",
          status: "redeemed",
        },
        {
          id: "c",
          createdAt: "2026-09-01T10:00:00.000Z",
          expiresAt: "2026-09-08T10:00:00.000Z",
          redeemedAt: null,
          status: "expired",
        },
      ],
    });
    serve();
    await open();
    await topic(/^Einladungscodes/);
    const items = within(screen.getByRole("list", { name: "Einladungen" })).getAllByRole(
      "listitem",
    );
    expect(items.map((i) => /offen|eingelöst|abgelaufen/.exec(i.textContent ?? "")?.[0])).toEqual([
      "offen",
      "eingelöst",
      "abgelaufen",
    ]);
  });

  it("US-ACC-05 without invitations the page says how to create one (P-09)", async () => {
    await open();
    await topic(/^Einladungscodes/);
    expect(screen.getByText(/Noch keine Einladung/)).toBeTruthy();
  });

  it("US-ACC-05 shows the expiry in the time zone of the profile", async () => {
    const { setProfileTimeZone } = await import("../../../kernel");
    setProfileTimeZone("Pacific/Auckland");
    current = overview({
      invitations: [
        {
          id: "a",
          createdAt: "2026-10-04T10:00:00.000Z",
          expiresAt: "2026-10-11T12:00:00.000Z",
          redeemedAt: null,
          status: "open",
        },
      ],
    });
    serve();
    await open();
    await topic(/^Einladungscodes/);
    // 2026-10-11T12:00Z is 12 Oct 01:00 in Auckland (UTC+13 in October).
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Einladungen" })).getByText(/12\.10\.2026/),
      ).toBeTruthy(),
    );
    setProfileTimeZone(null);
  });
});

describe("US-QS-15 operator overview: one row per topic, each a layer", () => {
  it("US-QS-15 each row names its topic and shows its current value, and opens its layer", async () => {
    current = overview({ cost: { amountCents: 4999, currency: "EUR", month: "2026-09" } });
    await open();
    const rows: [RegExp, string][] = [
      [/^Zahlen/, "12 Konten · 5 aktiv"],
      [/^Einstieg/, "Dauer und Schritte beim Einstieg neuer Konten"],
      [/^Monatliche Kosten/, "49,99\u00a0€ (September 2026)"],
      [/^Registrierung/, "offen für alle"],
      [/^Einladungscodes/, "noch keine"],
    ];
    for (const [name, value] of rows) {
      const row = screen.getByRole("button", { name });
      expect(row.textContent).toContain(value);
      expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    }
    const dialog = await topic(/^Einstieg/);
    expect(within(dialog).getByRole("heading", { name: "Einstieg" })).toBeTruthy();
  });

  it("US-QS-15 a long list of invitations is paged: five per page, 'Seite n von m' and Weiter", async () => {
    current = overview({
      invitations: Array.from({ length: 7 }, (_, i) => ({
        id: `i${i}`,
        createdAt: "2026-10-04T10:00:00.000Z",
        expiresAt: "2026-10-11T10:00:00.000Z",
        redeemedAt: null,
        status: "open" as const,
      })),
    });
    serve();
    await open();
    const dialog = await topic(/^Einladungscodes/);
    const list = within(dialog).getByRole("list", { name: "Einladungen" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(dialog).getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Weiter" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialog).getByText("Seite 2 von 2")).toBeTruthy();
  });
});

describe("US-ACC-05 · DS-52 to DS-49 states and primitives", () => {
  it("US-ACC-05 · DS-52 while loading, a skeleton of the page stands in with one status and hidden blocks", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = render(
      <MemoryRouter>
        <OperatorPage api="http://api" token={token} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toContain("Zahlen werden geladen");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
  });

  it("US-ACC-05 · DS-26 the empty invitation list offers the next action: it takes the operator to the validity field", async () => {
    await open();
    await topic(/^Einladungscodes/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Gültigkeit wählen" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Gültig für (Tage)"));
  });

  it("US-ACC-05 · DS-49 a refusal shows the German text of its error code, never the raw server text", async () => {
    serve(async () => json(403, { error: { code: "access.denied", text: "RAW SERVER TEXT" } }));
    await open();
    await topic(/^Einladungscodes/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Code erstellen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Darauf hast du keinen Zugriff.");
  });

  it("US-ACC-05 · DS-48 an invalid amount marks the field and moves the focus to it", async () => {
    await open();
    await topic(/^Monatliche Kosten/);
    const user = userEvent.setup();
    const amount = screen.getByLabelText("Betrag");
    await user.type(amount, "12,345");
    await user.click(screen.getByRole("button", { name: "Kosten speichern" }));
    const alert = await screen.findByRole("alert");
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")).toContain(alert.id);
    expect(document.activeElement).toBe(amount);
  });
});

describe("US-QS-14 operator page keeps the focus while and after a save (SC 2.4.3)", () => {
  const created = { id: "i9", code: "ABCD-EFGH", expiresAt: "2026-10-11T10:00:00.000Z" };
  const cases = [
    {
      topic: /^Monatliche Kosten/,
      button: "Kosten speichern",
      done: "Monatliche Kosten gespeichert.",
      prep: true,
    },
    {
      topic: /^Registrierung/,
      button: "Nur mit Einladungscode erlauben",
      done: /ab jetzt nur mit Einladungscode/,
    },
    { topic: /^Einladungscodes/, button: "Code erstellen", done: "Einladungscode erstellt." },
  ];
  for (const c of cases)
    it(`US-QS-14 after "${c.button}" the focus stays on the control, not on the body`, async () => {
      let release: () => void = () => undefined;
      serve(
        (path, init) =>
          new Promise<Response>((resolve) => {
            release = () =>
              resolve(
                path === "/operator/invitations"
                  ? new Response(JSON.stringify(created), { status: 201 })
                  : new Response(JSON.stringify(JSON.parse(String(init.body ?? "{}"))), {
                      status: 200,
                    }),
              );
          }),
      );
      await open();
      await topic(c.topic);
      const user = userEvent.setup();
      if (c.prep) await user.type(screen.getByLabelText("Betrag"), "12,50");
      const button = screen.getByRole("button", { name: c.button });
      await user.click(button);
      // While the write runs the control stays focused and says it is busy; it does not drop the focus.
      await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
      expect(document.activeElement).toBe(button);
      release();
      await screen.findByText(c.done);
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.textContent).toBe(button.textContent);
    });
});

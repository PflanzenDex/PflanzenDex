// @vitest-environment jsdom
import type { OperatorOverview } from "@pflanzendex/core";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAmount } from "./operator-cost";
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

const open = async () => {
  render(<OperatorPage api="http://api" token={token} />);
  await screen.findByRole("heading", { name: "Betreiber" });
};

describe("US-ACC-05 operator area: counts, no content", () => {
  it("US-ACC-05 shows accounts and active users, and the cost per user as unknown (P-08)", async () => {
    await open();
    const facts = screen.getByRole("region", { name: "Zahlen" });
    expect(within(facts).getByText("Konten").nextElementSibling?.textContent).toBe("12");
    expect(
      within(facts).getByText("Aktive Nutzer (letzte 30 Tage)").nextElementSibling?.textContent,
    ).toBe("5");
    expect(within(facts).getByText("Kosten pro Nutzer").nextElementSibling?.textContent).toMatch(
      /^unbekannt/,
    );
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
    expect(document.body.textContent).not.toMatch(/@|Exemplar|Art /);
  });

  it("US-ACC-05 a plant keeper's refusal (403 access.denied) is shown with a way to reload (P-09, P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        json(403, { error: { code: "access.denied", text: "Darauf hast du keinen Zugriff." } }),
      ),
    );
    render(<OperatorPage api="http://api" token={token} />);
    expect(await screen.findByText("Darauf hast du keinen Zugriff.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Erneut laden/ })).toBeTruthy();
  });
});

describe("US-ACC-05 monthly cost and cost per user", () => {
  const facts = () => screen.getByRole("region", { name: "Zahlen" });
  const fact = (label: string) =>
    within(facts()).getByText(label).nextElementSibling?.textContent ?? "";

  it("US-ACC-05 without a figure: cost per user unknown with what to do (P-08, P-09)", async () => {
    await open();
    expect(fact("Monatliche Kosten")).toBe("nicht eingetragen");
    expect(fact("Kosten pro Nutzer")).toBe("unbekannt: trage unten die Kosten eines Monats ein");
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
    await open();
    expect(fact("Monatliche Kosten")).toMatch(/^49,99\s€ \(September 2026\)$/);
    expect(fact("Kosten pro Nutzer")).toMatch(/^10,00\s€ \(September 2026, manuell eingetragen\)$/);
  });

  it("US-ACC-05 a figure without active users: cost per user unknown with the reason", async () => {
    current = overview({
      activeAccounts: 0,
      cost: { amountCents: 4999, currency: "EUR", month: "2026-09" },
      costPerUser: { known: false, reason: "no_active_accounts" },
    });
    await open();
    expect(fact("Kosten pro Nutzer")).toBe("unbekannt: es gibt noch keine aktiven Nutzer");
  });

  it("US-ACC-05 saving sends the amount in cents with a repeat-guard key and reloads the numbers", async () => {
    serve((path, init) =>
      path === "/operator/cost" && init.method === "PUT"
        ? json(200, JSON.parse(String(init.body)))
        : json(404, {}),
    );
    await open();
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
    expect(screen.getByText("offen für alle")).toBeTruthy();
    cleanup();
    current = overview({ invitationOnly: true });
    serve();
    await open();
    expect(screen.getByText("nur mit Einladungscode")).toBeTruthy();
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
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Nur mit Einladungscode erlauben" });
    await user.dblClick(button);
    answer();
    await screen.findByText("nur mit Einladungscode");
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
    expect(screen.getByText(/Noch keine Einladung/)).toBeTruthy();
  });

  it("US-ACC-05 shows the expiry in the time zone of the profile", async () => {
    const { setProfileTimeZone } = await import("../kernel");
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
    // 2026-10-11T12:00Z is 12 Oct 01:00 in Auckland (UTC+13 in October).
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Einladungen" })).getByText(/12\.10\.2026/),
      ).toBeTruthy(),
    );
    setProfileTimeZone(null);
  });
});

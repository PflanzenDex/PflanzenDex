// @vitest-environment jsdom
import type { OperatorOverview } from "@pflanzendex/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAmount } from "../../schemas";
import { OperatorPage } from "./operator-page";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { filledIn, hasOwnBorder, isTinted } from "@/shared/ui/button.roles";

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
let deletions: unknown;
/** Holds the answer of `/operator/deletions` until the test releases it (issue 1722). */
let deletionsGate: Promise<void> | undefined;
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
      if (path === "/operator/deletions") {
        if (deletionsGate) await deletionsGate;
        return json(200, deletions);
      }
      return extra(path, init);
    }),
  );
}

beforeEach(() => {
  current = overview();
  deletions = { warningDays: 7, near: [], past: [], identityRemovals: [] };
  deletionsGate = undefined;
  serve();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
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
    expect(fact(facts, "Aktive Konten (letzte 30 Tage)")).toBe("5");
    expect(fact(facts, "Kosten pro aktivem Konto")).toMatch(/^unbekannt/);
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
  it("US-ACC-05 without a figure: cost per user is unbekannt and Kosten eintragen opens the cost layer (P-08, P-09)", async () => {
    const facts = await numbers();
    expect(fact(facts, "Kosten pro aktivem Konto")).toBe("unbekanntKosten eintragen");
    expect(within(facts).getByText("unbekannt")).toBeTruthy();
    expect(within(facts).getByRole("button", { name: "Kosten eintragen" })).toBeTruthy();
    // The monthly cost is shown once, in its own overview row (US-QS-15), not in the sheet.
    expect(within(facts).queryByText("Monatliche Kosten")).toBeNull();
    expect(within(facts).queryByText("nicht eingetragen")).toBeNull();
  });

  it("US-ACC-05 Kosten eintragen replaces the sheet Zahlen with the layer Monatliche Kosten and its form (US-QS-15)", async () => {
    const facts = await numbers();
    await userEvent.click(within(facts).getByRole("button", { name: "Kosten eintragen" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Monatliche Kosten" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Betrag")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Zahlen" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Zahlen" })).toBeNull();
  });

  it("US-ACC-05 with a figure: amount per user with month and 'manuell eingetragen', and no Kosten eintragen", async () => {
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
    expect(fact(facts, "Kosten pro aktivem Konto")).toMatch(
      /^10,00\s€ \(September 2026, manuell eingetragen\)$/,
    );
    expect(within(facts).queryByRole("button", { name: "Kosten eintragen" })).toBeNull();
    expect(within(facts).queryByText("Monatliche Kosten")).toBeNull();
  });

  it("US-ACC-05 a figure without active users: cost per user unknown with the reason", async () => {
    current = overview({
      activeAccounts: 0,
      cost: { amountCents: 4999, currency: "EUR", month: "2026-09" },
      costPerUser: { known: false, reason: "no_active_accounts" },
    });
    const facts = await numbers();
    expect(fact(facts, "Kosten pro aktivem Konto")).toBe(
      "unbekannt: es gibt noch keine aktiven Konten",
    );
  });

  it("US-QS-24 US-ACC-05 the cost form has no heading that repeats the layer title and its save sits in the bar with Abbrechen, not in a sticky footer", async () => {
    serve(() => json(404, {}));
    await open();
    await topic(/^Monatliche Kosten/);
    const save = screen.getByRole("button", { name: "Kosten sichern" });
    // The bar may be drawn outside the form (the sheet's bar); the button names its form.
    const form = document.getElementById(save.getAttribute("form") ?? "");
    expect(form?.querySelector("h1, h2, h3")).toBeNull();
    const cancel = screen.getByRole("button", { name: "Abbrechen" });
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(cancel.parentElement).toBe(save.parentElement);
    expect(document.querySelector("[class*='sticky'][class*='bottom-0']")).toBeNull();
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
    await userEvent.selectOptions(month, "2026-09");
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
    expect(await screen.findByText("Monatliche Kosten gesichert.")).toBeTruthy();
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
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/zum Beispiel 12,50/);
    await userEvent.clear(screen.getByLabelText("Betrag"));
    await userEvent.type(screen.getByLabelText("Betrag"), "12,50");
    await userEvent.clear(screen.getByLabelText("Währung"));
    await userEvent.type(screen.getByLabelText("Währung"), "E1");
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
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

describe("US-ACC-05 · US-QS-32 registration mode is a switch on the overview", () => {
  /** The page with the announcer the app shell mounts above it: a saved switch is said through it (SG-FEED-04). */
  const showAnnounced = () =>
    render(
      <MemoryRouter>
        <AnnouncerProvider>
          <OperatorPage api="http://api" token={token} />
        </AnnouncerProvider>
      </MemoryRouter>,
    );
  const announced = () =>
    document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";
  const mode = () => screen.findByRole("switch", { name: "Nur mit Einladungscode" });

  it("US-ACC-05 · SG-CTRL-02 the row 'Nur mit Einladungscode' is a switch on the page, off while registration is open, and opens no layer", async () => {
    await open();
    const toggle = await mode();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    const line = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toContain("Bestehende Konten melden sich");
    expect(screen.queryByRole("button", { name: /^Registrierung/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nur mit Einladungscode erlauben" })).toBeNull();
    cleanup();
    current = overview({ invitationOnly: true });
    serve();
    await open();
    expect((await mode()).getAttribute("aria-checked")).toBe("true");
  });

  it("US-ACC-05 switching on sends one write with a repeat-guard key; the switch is the result and the announcer says it once", async () => {
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
    showAnnounced();
    await screen.findByRole("button", { name: /^Zahlen/ });
    const toggle = await mode();
    const user = userEvent.setup();
    await user.dblClick(toggle);
    answer();
    await waitFor(() =>
      expect(announced()).toMatch(/Registrierung: ab jetzt nur mit Einladungscode/),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Nur mit Einladungscode" }).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    const writes = calls.filter((c) => c.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({ invitationOnly: true });
    expect(writes[0]?.headers["Idempotency-Key"]).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-ACC-05 · P-10 a refused save keeps the switch where it was and shows the German text at its row", async () => {
    serve((path, init) =>
      path === "/operator/registration" && init.method === "PUT"
        ? json(400, { error: { code: "input.invalid", text: "RAW SERVER TEXT" } })
        : json(404, {}),
    );
    await open();
    const toggle = await mode();
    await userEvent.click(toggle);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Die Eingabe ist ungültig");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(toggle.getAttribute("aria-describedby")).toContain(alert.id);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
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

  it("US-QS-03 · P-10 a key conflict of the code offers 'Hinweis schließen', which clears the notice and frees the key for the next code", async () => {
    serve(async () =>
      json(409, { error: { code: "idempotency.key_conflict", text: "raw server text" } }),
    );
    await open();
    await topic(/^Einladungscodes/);
    const user = userEvent.setup();
    const create = screen.getByRole("button", { name: "Code erstellen" });
    await user.click(create);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Deine erste Eingabe ist gesichert.");
    await user.click(within(alert).getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(create);
    await user.click(create);
    await screen.findByRole("alert");
    const keys = calls.filter((c) => c.method === "POST").map((c) => c.headers["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
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
    const { setProfileTimeZone } = await import("../../../shared/data");
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

describe("US-ACC-05 US-QS-32 the new code: one line, share or copy (fixture code only)", () => {
  const created = {
    id: "i9",
    code: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
    expiresAt: "2026-10-11T10:00:00.000Z",
  };
  const listed = {
    id: "i9",
    createdAt: "2026-10-04T10:00:00.000Z",
    expiresAt: "2026-10-11T10:00:00.000Z",
    redeemedAt: null,
  };
  const copied = "Kopiert";
  const hand = "Kopieren nicht möglich. Markiere den Code und kopiere ihn von Hand.";

  /**
   * Creates a code in the layer and returns its box and the clipboard write to watch. The write is watched after the
   * first user event: user-event puts its clipboard stub on navigator then, and the spy replaces its writeText.
   */
  const createCode = async (writeFails = false) => {
    serve(async (path, init) => {
      if (path !== "/operator/invitations" || init.method !== "POST") return json(404, {});
      // As the server does: the reload after a create lists the new code, so the empty list's action is gone.
      current = overview({ invitations: [{ ...listed, status: "open" as const }] });
      return json(201, created);
    });
    await open();
    const dialog = await topic(/^Einladungscodes/);
    const write = vi.spyOn(navigator.clipboard, "writeText");
    if (writeFails) write.mockRejectedValue(new Error("denied"));
    else write.mockResolvedValue(undefined);
    await userEvent.setup().click(screen.getByRole("button", { name: "Code erstellen" }));
    const box = await screen.findByRole("region", { name: "Neuer Einladungscode" });
    return { dialog, box, write };
  };

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "share");
  });

  it("US-ACC-05 US-QS-32 after creating a code the layer has one filled button, Code teilen and Code kopieren", async () => {
    const { dialog, box } = await createCode();
    // "Code teilen" is tinted, without a border (SG-BTN-01, FX-39 sweep 3, F-0339); "Code kopieren" is a text link.
    const share = within(box).getByRole("button", { name: "Code teilen" });
    expect(isTinted(share)).toBe(true);
    expect(hasOwnBorder(share)).toBe(false);
    expect(isTinted(within(box).getByRole("button", { name: "Code kopieren" }))).toBe(false);
    expect(filledIn(dialog).map((b) => b.textContent)).toEqual(["Code erstellen"]);
  });

  it("US-ACC-05 US-QS-32 the code is one line in 16 px monospace that scrolls on its own, and stays selectable", async () => {
    const { box } = await createCode();
    const code = within(box).getByText(created.code);
    expect(code.className.split(" ")).toEqual(
      expect.arrayContaining(["font-mono", "text-base", "whitespace-nowrap", "select-all"]),
    );
    expect(code.closest('[role="region"]')?.className).toContain("overflow-x-auto");
  });

  it("US-ACC-05 US-QS-32 Code teilen shares only the code through the share sheet", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const { box, write } = await createCode();
    await userEvent.click(within(box).getByRole("button", { name: "Code teilen" }));
    expect(share).toHaveBeenCalledWith({ text: created.code });
    expect(write).not.toHaveBeenCalled();
    expect(within(box).queryByRole("button", { name: copied })).toBeNull();
  });

  it("US-ACC-05 US-QS-32 without the Web Share API Code teilen copies the code and the copy button reads Kopiert", async () => {
    const { box, write } = await createCode();
    await userEvent.click(within(box).getByRole("button", { name: "Code teilen" }));
    expect(write).toHaveBeenCalledWith(created.code);
    expect(await within(box).findByRole("button", { name: copied })).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 Code kopieren copies the code and then reads Kopiert", async () => {
    const { box, write } = await createCode();
    await userEvent.click(within(box).getByRole("button", { name: "Code kopieren" }));
    expect(write).toHaveBeenCalledWith(created.code);
    expect(await within(box).findByRole("button", { name: copied })).toBeTruthy();
    expect(within(box).queryByText(hand)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 a failing copy shows the hand-copy line and no fake success", async () => {
    const { box } = await createCode(true);
    await userEvent.click(within(box).getByRole("button", { name: "Code kopieren" }));
    expect(await within(box).findByText(hand)).toBeTruthy();
    expect(within(box).queryByRole("button", { name: copied })).toBeNull();
    expect(within(box).getByRole("button", { name: "Code kopieren" })).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 a share sheet the keeper closes changes nothing", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw Object.assign(new Error("closed"), { name: "AbortError" });
      },
    });
    const { box, write } = await createCode();
    await userEvent.click(within(box).getByRole("button", { name: "Code teilen" }));
    expect(write).not.toHaveBeenCalled();
    expect(within(box).queryByRole("button", { name: copied })).toBeNull();
    expect(within(box).queryByText(hand)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 a share sheet that refuses for another reason falls back to copying the code", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
      },
    });
    const { box, write } = await createCode();
    await userEvent.click(within(box).getByRole("button", { name: "Code teilen" }));
    expect(write).toHaveBeenCalledWith(created.code);
    expect(await within(box).findByRole("button", { name: copied })).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 the copied code is announced politely through the shared live region", async () => {
    serve(async (path, init) =>
      path === "/operator/invitations" && init.method === "POST"
        ? json(201, created)
        : json(404, {}),
    );
    render(
      <MemoryRouter>
        <AnnouncerProvider>
          <OperatorPage api="http://api" token={token} />
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /^Zahlen/ });
    await topic(/^Einladungscodes/);
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Code erstellen" }));
    const box = await screen.findByRole("region", { name: "Neuer Einladungscode" });
    await userEvent.click(within(box).getByRole("button", { name: "Code kopieren" }));
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
        "Der Code liegt in der Zwischenablage.",
      ),
    );
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

  it("US-QS-15 a long list of invitations is one scroll list in its layer: every entry, no 'Seite n von m', no Weiter", async () => {
    setViewportWidth(768);
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
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(within(dialog).queryByText(/Seite \d+ von \d+/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("US-QS-15 the page is one screen (DS-61): its frame marks the fit, so at a large text size only the content region scrolls", async () => {
    show();
    const heading = await screen.findByRole("heading", { name: "Betreiber" });
    expect(heading.closest("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-15 the figures of Zahlen take their columns from the width of their layer, not the window (issue 1640)", async () => {
    const region = await numbers();
    const list = region.querySelector("dl") as HTMLElement;
    expect(region.className.split(" ")).toContain("@container");
    expect(list.className.split(" ")).toContain("@lg:grid-cols-[auto_1fr]");
    expect(list.className.split(" ").filter((c) => /^(sm|md|lg|xl):/.test(c))).toEqual([]);
  });
});

describe("US-ACC-05 · DS-52 to DS-49 states and primitives", () => {
  it("US-ACC-05 · DS-52 while loading, a skeleton of the page stands in with one status and hidden blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    delayLoads();
    const { container } = render(
      <MemoryRouter>
        <OperatorPage api="http://api" token={token} />
      </MemoryRouter>,
    );
    expect((await screen.findByRole("status")).textContent).toContain("Zahlen werden geladen");
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
  });

  it("US-QS-32 · SG-BTN-02 the codes layer has one filled button, and an empty list names its next step in words (P-09)", async () => {
    await open();
    const layer = await topic(/^Einladungscodes/);
    const filled = within(layer)
      .getAllByRole("button")
      .filter((b) => b.className.split(/\s+/).includes("bg-primary"));
    expect(filled.map((b) => b.textContent)).toEqual(["Code erstellen"]);
    expect(within(layer).getByText(/Erstelle oben einen Code\./)).toBeTruthy();
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
    await user.click(screen.getByRole("button", { name: "Kosten sichern" }));
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
      button: "Kosten sichern",
      done: "Monatliche Kosten gesichert.",
      prep: true,
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

describe("US-ACC-04 operator page: the topic Löschfristen", () => {
  it("US-ACC-04 marking an identity removal posts once and confirms it in words (issue 1673)", async () => {
    const identity = {
      kind: "identity",
      entryId: "e-1",
      requestedAt: "2026-09-01T08:00:00.000Z",
      deadline: "2026-10-01T08:00:00.000Z",
      subject: "sub-1",
      completedAt: "2026-09-02T08:00:00.000Z",
    };
    serve((path, init) =>
      path === "/operator/deletion-log/e-1/identity-removed" && init.method === "POST"
        ? json(200, { entryId: "e-1", outcome: "marked" })
        : json(404, {}),
    );
    deletions = { warningDays: 7, near: [], past: [], identityRemovals: [identity] };
    await open();
    await topic(/^Löschfristen/);
    await userEvent.click(
      await screen.findByRole("button", { name: "Als entfernt markieren, Kennung sub-1" }),
    );
    expect(await screen.findByText("Eintrag als entfernt markiert.")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual([
      "/operator/deletion-log/e-1/identity-removed",
    ]);
  });

  it("US-ACC-04 a tap on the row Löschfristen while its counts still load opens the layer, which shows them once they arrive (issue 1722)", async () => {
    let answer: () => void = () => undefined;
    deletionsGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await open();
    // The row names its loading for assistive technology while the counts are on their way (SG-STATE-02).
    const row = await screen.findByRole("button", { name: /Löschfristen werden geladen/ });
    await userEvent.click(row);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Löschfristen" })).toBeTruthy();
    answer();
    expect(await within(dialog).findByText("Nichts zu tun.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("US-QS-32 · SG-STATE-02 while its counts load the row Löschfristen keeps the line of its common answer, no number (F-0338, issue 2038)", async () => {
    let answer: () => void = () => undefined;
    deletionsGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await open();
    const row = await screen.findByRole("button", { name: /Löschfristen werden geladen/ });
    const shape = row.querySelector("[data-deadline-skeleton] [aria-hidden='true']");
    expect(shape?.textContent).toBe("Keine Frist offen");
    expect(shape?.textContent).not.toMatch(/\d/);
    expect(shape?.className).toContain("text-transparent");
    answer();
    expect(await screen.findByRole("button", { name: /Keine Frist offen/ })).toBe(row);
  });

  it("US-ACC-04 a press on the row Löschfristen that starts while its counts load and ends after they arrive still opens the layer (issue 1722)", async () => {
    let answer: () => void = () => undefined;
    deletionsGate = new Promise<void>((resolve) => {
      answer = resolve;
    });
    await open();
    const row = await screen.findByRole("button", { name: /Löschfristen werden geladen/ });
    fireEvent.pointerDown(row);
    answer();
    // The counts arrive while the press is still on the row; the row must stay the one the press started on.
    expect(await screen.findByRole("button", { name: /Keine Frist offen/ })).toBe(row);
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("US-ACC-05 US-QS-32 the cost and codes layers ask before they discard typed input (SG-FORM-06)", () => {
  const created = {
    id: "i9",
    code: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01",
    expiresAt: "2026-10-11T10:00:00.000Z",
  };
  const question = { name: "Eingabe verwerfen?" };
  const costLayer = { name: "Monatliche Kosten" };
  const codesLayer = { name: "Einladungscodes" };

  beforeEach(() => setViewportWidth(360));

  /** The page on the browser history, so that Back is a real history step (US-QS-15, US-QS-32). */
  const openOnBrowser = async () => {
    window.history.replaceState(null, "", "/betreiber");
    render(
      <BrowserRouter>
        <OperatorPage api="http://api" token={token} />
      </BrowserRouter>,
    );
    await screen.findByRole("heading", { name: "Betreiber" });
    await screen.findByRole("button", { name: /^Zahlen/ });
  };

  /** Opens the cost layer and types an amount into it, which is not saved. */
  const typeAmount = async (amount: string) => {
    const layer = await topic(/^Monatliche Kosten/);
    await userEvent.type(within(layer).getByLabelText("Betrag"), amount);
    return layer;
  };

  const askedQuestion = () => screen.findByRole("dialog", question);
  const noQuestion = () => waitFor(() => expect(screen.queryByRole("dialog", question)).toBeNull());

  it("US-ACC-05 US-QS-32 Escape with a changed amount asks Eingabe verwerfen?; Weiter bearbeiten keeps the amount and the layer", async () => {
    await open();
    await typeAmount("12,50");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await askedQuestion()).getByRole("button", { name: "Weiter bearbeiten" }),
    );
    await noQuestion();
    expect(screen.getByRole("dialog", costLayer)).toBeTruthy();
    expect((screen.getByLabelText("Betrag") as HTMLInputElement).value).toBe("12,50");
  });

  it("US-ACC-05 US-QS-32 Escape with a changed amount, then Verwerfen, closes the cost layer", async () => {
    await open();
    await typeAmount("12,50");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await askedQuestion()).getByRole("button", { name: "Eingabe verwerfen" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", costLayer)).toBeNull());
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 the close control of the cost layer from md asks while the amount is changed", async () => {
    setViewportWidth(800);
    await open();
    const layer = await typeAmount("12,50");
    await userEvent.click(within(layer).getByRole("button", { name: "Schließen" }));
    expect(await askedQuestion()).toBeTruthy();
    expect(screen.getByLabelText("Betrag")).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 an outside tap on the scrim of the cost sheet asks while the amount is changed", async () => {
    await open();
    await typeAmount("12,50");
    const scrim = document.querySelector<HTMLElement>(".bg-scrim");
    expect(scrim).not.toBeNull();
    await userEvent.click(scrim as HTMLElement);
    expect(await askedQuestion()).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 an outside tap on the scrim closes an unchanged cost sheet at once, with no question", async () => {
    await open();
    await topic(/^Monatliche Kosten/);
    const scrim = document.querySelector<HTMLElement>(".bg-scrim");
    expect(scrim).not.toBeNull();
    await userEvent.click(scrim as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("dialog", costLayer)).toBeNull());
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 Back with a changed amount asks; Verwerfen lands on the list, its address without ?sheet", async () => {
    await openOnBrowser();
    await typeAmount("12,50");
    window.history.back();
    const ask = await askedQuestion();
    expect(window.location.search).toContain("sheet=kosten");
    await userEvent.click(within(ask).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog", costLayer)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 an unchanged cost layer closes at once on Escape, with no question", async () => {
    await open();
    await topic(/^Monatliche Kosten/);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", costLayer)).toBeNull());
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 an unchanged cost layer closes at once on Back, with no question", async () => {
    await openOnBrowser();
    await topic(/^Monatliche Kosten/);
    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog", costLayer)).toBeNull();
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 after a saved cost the layer is clean: Escape closes it without a question", async () => {
    serve((path, init) =>
      path === "/operator/cost" && init.method === "PUT"
        ? json(200, JSON.parse(String(init.body)))
        : json(404, {}),
    );
    await open();
    await typeAmount("12,50");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await askedQuestion()).getByRole("button", { name: "Weiter bearbeiten" }),
    );
    await noQuestion();
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
    expect(await screen.findByText("Monatliche Kosten gesichert.")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", costLayer)).toBeNull());
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });

  it("US-ACC-05 US-QS-32 a refused cost save keeps the amount unsaved, so Escape still asks", async () => {
    serve(() =>
      json(400, {
        error: {
          code: "operator_cost.month_in_future",
          text: "Dieser Monat liegt in der Zukunft. Trage die Kosten eines Monats ein, der schon begonnen hat.",
        },
      }),
    );
    await open();
    await typeAmount("10");
    await userEvent.click(screen.getByRole("button", { name: "Kosten sichern" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Zukunft/);
    await userEvent.keyboard("{Escape}");
    expect(await askedQuestion()).toBeTruthy();
  });

  it("US-ACC-05 US-QS-32 the validity field of the codes layer asks on Escape after a changed value", async () => {
    await open();
    const layer = await topic(/^Einladungscodes/);
    const days = within(layer).getByLabelText("Gültig für (Tage)");
    await userEvent.clear(days);
    await userEvent.type(days, "3");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await askedQuestion()).getByRole("button", { name: "Eingabe verwerfen" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", codesLayer)).toBeNull());
  });

  it("US-ACC-05 US-QS-32 after a created code the codes layer is clean: Escape closes it without a question", async () => {
    serve(async (path, init) =>
      path === "/operator/invitations" && init.method === "POST"
        ? json(201, created)
        : json(404, {}),
    );
    await open();
    const layer = await topic(/^Einladungscodes/);
    const days = within(layer).getByLabelText("Gültig für (Tage)");
    await userEvent.clear(days);
    await userEvent.type(days, "3");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(await askedQuestion()).getByRole("button", { name: "Weiter bearbeiten" }),
    );
    await noQuestion();
    await userEvent.click(screen.getByRole("button", { name: "Code erstellen" }));
    await screen.findByRole("region", { name: "Neuer Einladungscode" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", codesLayer)).toBeNull());
    expect(screen.queryByRole("dialog", question)).toBeNull();
  });
});

describe("US-QS-14 · US-QS-32 the registration switch keeps the focus while and after its save (SC 2.4.3)", () => {
  it("US-QS-14 after the switch is turned the focus stays on the switch, not on the body", async () => {
    let release: () => void = () => undefined;
    serve(
      (_path, init) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(String(init.body ?? "{}"), { status: 200 }));
        }),
    );
    await open();
    const toggle = await screen.findByRole("switch", { name: "Nur mit Einladungscode" });
    const user = userEvent.setup();
    toggle.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).toBe("true"));
    expect(document.activeElement).toBe(toggle);
    release();
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });
});

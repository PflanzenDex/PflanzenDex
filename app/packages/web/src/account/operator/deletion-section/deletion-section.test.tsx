// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { DeadlineRow, DeletionBody, DeletionSection, deadlineSummary } from "./deletion-section";
import { utcText } from "./deletion-parts/deletion-parts";
import { markIdentityRemoved, type DeletionsView } from "../../api/access-api";

// The layers and the pager keep their place in the address, so every render needs a router (US-QS-15).
const inRouter = (ui: ReactElement) => <MemoryRouter>{ui}</MemoryRouter>;
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const request = {
  kind: "request" as const,
  entryId: null,
  requestedAt: "2026-10-28T10:00:00.000Z",
  deadline: "2026-11-28T10:00:00.000Z",
  subject: null,
  completedAt: null,
};
const identity = {
  kind: "identity" as const,
  entryId: "22222222-2222-4222-8222-222222222222",
  requestedAt: "2026-09-10T08:00:00.000Z",
  deadline: "2026-10-10T08:00:00.000Z",
  subject: "sub-keycloak-1",
  completedAt: "2026-09-17T08:00:00.000Z",
};
const view = (over: Partial<DeletionsView> = {}): DeletionsView => ({
  warningDays: 7,
  near: [],
  past: [],
  identityRemovals: [],
  ...over,
});
const markName = "Als entfernt markieren, Kennung sub-keycloak-1";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-04 the card Fristen shows the deadlines in UTC and the open identity removals", () => {
  it("US-ACC-04 lists a passed deadline with its dates in UTC, and the identity removal with its subject", () => {
    render(
      inRouter(
        <DeletionBody
          view={view({ past: [identity], identityRemovals: [identity] })}
          running={false}
          onMark={() => undefined}
        />,
      ),
    );
    expect(screen.getByText("Frist überschritten")).toBeTruthy();
    expect(screen.getAllByText(/10\.10\.2026.*08:00 UTC/).length).toBeGreaterThan(0);
    expect(screen.getByText("Kennung sub-keycloak-1")).toBeTruthy();
    expect(
      screen.getByText(
        "Überschritten: Prüfe die Ursache im Runbook „Konto löschen“ und halte den Vorfall fest.",
      ),
    ).toBeTruthy();
  });

  it("US-ACC-04 says which request is near its deadline, and never names an account", () => {
    render(
      inRouter(
        <DeletionBody view={view({ near: [request] })} running={false} onMark={() => undefined} />,
      ),
    );
    expect(screen.getByText("Löschung wartet auf den Auftrag")).toBeTruthy();
    expect(screen.getByText(/28\.11\.2026.*10:00 UTC/)).toBeTruthy();
    expect(screen.getByText("Keine Frist ist überschritten.")).toBeTruthy();
    expect(screen.queryByText(/accountId|account_id/)).toBeNull();
  });

  it("US-ACC-04 with nothing open the card says so and what to do next (P-09)", () => {
    render(inRouter(<DeletionBody view={view()} running={false} onMark={() => undefined} />));
    expect(screen.getByText("Keine offenen Löschungen")).toBeTruthy();
    expect(screen.getByText(/Nichts zu tun/)).toBeTruthy();
  });

  it("US-ACC-04 marking an identity removal passes its entry id on, and a running write blocks a second mark", () => {
    const onMark = vi.fn();
    const { rerender } = render(
      inRouter(
        <DeletionBody
          view={view({ identityRemovals: [identity] })}
          running={false}
          onMark={onMark}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: markName }));
    expect(onMark).toHaveBeenCalledWith(identity.entryId);
    rerender(
      inRouter(
        <DeletionBody view={view({ identityRemovals: [identity] })} running onMark={onMark} />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: markName }));
    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it("US-ACC-04 the overview row shows the counts of the card, and the dates are UTC", () => {
    expect(
      deadlineSummary(view({ near: [request], past: [identity], identityRemovals: [identity] })),
    ).toBe("1 nahe · 1 überschritten · 1 offen beim Anmeldedienst");
    expect(utcText(identity.deadline)).toMatch(/10\.10\.2026.*08:00 UTC/);
  });

  it("US-ACC-04 the row loads the deletions of the operator and shows the counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(200, view({ near: [request], identityRemovals: [identity] })),
      ),
    );
    render(inRouter(<DeadlineRow api="http://api" token={async () => "tok"} />));
    expect(
      await screen.findByText("1 nahe · 0 überschritten · 1 offen beim Anmeldedienst"),
    ).toBeTruthy();
  });

  it("US-ACC-04 a failed load is named in the row, which still opens the layer with the reason (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(403, { error: { code: "access.denied", text: "RAW SERVER TEXT" } }),
      ),
    );
    render(inRouter(<DeadlineRow api="http://api" token={async () => "tok"} />));
    expect(
      await screen.findByText(
        "Fristen konnten nicht geladen werden. Tippe, um es erneut zu versuchen.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();
  });
});

describe("US-ACC-04 the card Fristen loads the open deletions and marks an identity removal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("US-ACC-04 the card loads the deletions of the operator and passes a mark on (issue 1673)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => json(200, view({ identityRemovals: [identity] }))),
    );
    const onMark = vi.fn();
    render(
      inRouter(
        <DeletionSection
          api="http://api"
          token={async () => "tok"}
          running={false}
          onMark={onMark}
        />,
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: markName }));
    expect(onMark).toHaveBeenCalledWith(identity.entryId);
  });
});

describe("US-ACC-04 markIdentityRemoved", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("US-ACC-04 posts to the deletion log entry and answers the outcome (issue 1673)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json(200, { entryId: "e-1", outcome: "already" }),
    );
    const r = await markIdentityRemoved("http://api", "tok", "e-1", { fetchFn });
    expect(r).toEqual({ ok: true, value: { entryId: "e-1", outcome: "already" } });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api/operator/deletion-log/e-1/identity-removed");
    expect(init?.method).toBe("POST");
  });

  it("US-ACC-04 a refusal is passed on with its code (issue 1673)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json(403, { error: { code: "access.denied", message: "no" } }),
    );
    const r = await markIdentityRemoved("http://api", "tok", "e-1", { fetchFn });
    expect(r.ok).toBe(false);
  });
});

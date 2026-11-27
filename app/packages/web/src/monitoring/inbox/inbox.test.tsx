// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/data";
import { Inbox } from "./inbox";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "../monitoring.de.json";
import { InboxSkeleton } from "./inbox.skeleton";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const show = (reminders: unknown[]) => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => response(200, { reminders })),
  );
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <Inbox api="http://api" token={token} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (id: string, localDate: string, status: string) => ({
  id,
  localDate,
  status,
  attempts: 1,
  lastError: null,
  items: [
    { id: `t:${id}`, occasion: "treatment", text: "Gießen fällig", nextAction: "Jetzt gießen" },
  ],
});

describe("US-MON-01 reminder inbox", () => {
  it("US-MON-01 shows the days newest first with text, next action and the status in words", async () => {
    show([row("2", "2026-10-10", "in_app"), row("1", "2026-10-09", "delivered")]);
    const days = await screen.findAllByRole("heading", { level: 4 });
    expect(days.map((d) => d.textContent)).toEqual([
      "Samstag, 10. Oktober 2026",
      "Freitag, 9. Oktober 2026",
    ]);
    expect(screen.getByText("Nur im Posteingang")).toBeTruthy();
    expect(screen.getByText("Zugestellt")).toBeTruthy();
    expect(screen.getAllByText("Jetzt gießen")).toHaveLength(2);
  });

  it("US-MON-01 keeps a failed delivery visible and points to the Today list (P-10)", async () => {
    show([row("1", "2026-10-09", "failed")]);
    expect(await screen.findByText("Zustellung fehlgeschlagen")).toBeTruthy();
    expect(screen.getByText(/Heute-Liste/)).toBeTruthy();
  });

  it("US-MON-01 says there is nothing to remind of and where it will appear", async () => {
    show([]);
    expect(await screen.findByText("Keine Erinnerungen")).toBeTruthy();
  });
});

describe("US-QS-14 issue 1697 · the inbox show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <InboxSkeleton label={table["inbox.loading"]} />,
      table["inbox.loading"],
    ));
});

describe("US-QS-32 the inbox entries are rows to the place of their step", () => {
  const STEP = "Behandle die Pflanze und hake den Termin als erledigt ab.";
  const entry = (id: string, text: string, occasion: string, nextAction: string) => ({
    id: `t:${id}`,
    occasion,
    text,
    nextAction,
  });

  it("US-QS-32 an entry is one link named by its text, to the Heute treatments where its step is ticked off", async () => {
    show([
      {
        id: "1",
        localDate: "2026-10-09",
        status: "delivered",
        attempts: 1,
        lastError: null,
        items: [
          entry("a", "„Flamingoblume“: Trauermücken – überfällig seit 3 Tagen.", "treatment", STEP),
        ],
      },
    ]);
    const link = await screen.findByRole("link", { name: /Flamingoblume/ });
    expect(link.getAttribute("href")).toBe("/today?sheet=treatments");
    expect(link.querySelector("svg.lucide-chevron-right")).not.toBeNull();
  });

  it("US-QS-32 the step is said once under the day's group, not under every entry", async () => {
    show([
      {
        id: "1",
        localDate: "2026-10-09",
        status: "delivered",
        attempts: 1,
        lastError: null,
        items: [
          entry("a", "„Flamingoblume“: Trauermücken.", "treatment", STEP),
          entry("b", "„Aloe“: Umtopfen fällig.", "treatment", STEP),
        ],
      },
    ]);
    await screen.findAllByRole("link", { name: /Flamingoblume|Aloe/ });
    expect(screen.getAllByText(STEP)).toHaveLength(1);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("US-QS-32 an entry of another topic opens the place of that topic (watering to Heute, phase to the Sammlung)", async () => {
    show([
      {
        id: "1",
        localDate: "2026-10-09",
        status: "delivered",
        attempts: 1,
        lastError: null,
        items: [
          entry(
            "w",
            "„Farn“: Gießen fällig.",
            "watering",
            "Gieße die Pflanze und trage sie als gegossen ein.",
          ),
          entry("p", "„Kakteen“ steht nicht am Soll-Standort.", "phase", "Stelle die Pflanze um."),
        ],
      },
    ]);
    expect((await screen.findByRole("link", { name: /Farn/ })).getAttribute("href")).toBe(
      "/today?sheet=watering",
    );
    expect(screen.getByRole("link", { name: /Kakteen/ }).getAttribute("href")).toBe(
      "/collection?view=plants&group=phase",
    );
    // Each occasion names its own step once, under its own group (P-09, #2016): no step is listed under every line.
    expect(screen.getAllByText("Gieße die Pflanze und trage sie als gegossen ein.")).toHaveLength(
      1,
    );
    expect(screen.getAllByText("Stelle die Pflanze um.")).toHaveLength(1);
  });
});

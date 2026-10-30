// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntroductionSection } from "./introduction-section";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const base = {
  windowDays: 90,
  settleDays: 7,
  minAccounts: 5,
  accounts: 14,
  steps: { value: 2, targetMet: true },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ONB-08 figures of the introduction in the operator area", () => {
  it("US-ONB-08 shows the figures against the targets as text, with what is counted and that nobody is tracked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(200, {
          ...base,
          medianSecondsToFirstPlant: { known: true, value: 75, targetMet: true },
          withoutPlantPercent: { known: true, value: 40, targetMet: false },
        }),
      ),
    );
    render(<IntroductionSection api="http://api" token={async () => "tok"} />);
    expect(
      await screen.findByText("75 Sekunden · Ziel: höchstens 90 Sekunden · erreicht"),
    ).toBeTruthy();
    expect(
      screen.getByText("40 Prozent · Ziel: höchstens 25 Prozent · nicht erreicht"),
    ).toBeTruthy();
    expect(screen.getByText("2 · Ziel: höchstens 3 · erreicht")).toBeTruthy();
    expect(screen.getByText(/kein einzelnes Konto und kein Klick erfasst/)).toBeTruthy();
  });

  it("US-ONB-08 · P-08 too few accounts: the figure is unknown with its reason, the target stays visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(200, {
          ...base,
          accounts: null,
          medianSecondsToFirstPlant: { known: false, reason: "too_few_accounts" },
          withoutPlantPercent: { known: false, reason: "too_few_accounts" },
        }),
      ),
    );
    render(<IntroductionSection api="http://api" token={async () => "tok"} />);
    expect(
      await screen.findByText("unbekannt (zu wenige Konten) · Ziel: höchstens 90 Sekunden"),
    ).toBeTruthy();
    expect(screen.getByText(/\(unbekannt, weniger als/)).toBeTruthy();
  });

  it("US-ONB-08 · P-10 a failing request shows its error with a retry, nothing is invented", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(500, { error: { code: "server.error", text: "Fehler" } }),
      ),
    );
    render(<IntroductionSection api="http://api" token={async () => "tok"} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("US-QS-32 one row per figure: the name, the value emphasised, and the target with the verdict in words", async () => {
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
    const median = await screen.findByText("Mediane Zeit bis zur ersten Pflanze");
    const row = median.closest("li") as HTMLElement;
    expect(row.textContent).toContain("1\u00a0min 15\u00a0s");
    expect(within(row).getByText(/Ziel: höchstens 90\s+s/)).toBeTruthy();
    expect(within(row).getByText("erreicht")).toBeTruthy();
    const without = screen
      .getByText("Konten ohne Pflanze nach 7 Tagen")
      .closest("li") as HTMLElement;
    expect(within(without).getByText(/^40\s%$/)).toBeTruthy();
    expect(within(without).getByText("nicht erreicht")).toBeTruthy();
    expect(within(without).getByText(/Ziel: höchstens 25\s+%/)).toBeTruthy();
    expect(screen.getByText(/kein einzelnes Konto und kein Klick erfasst/)).toBeTruthy();
  });

  it("US-QS-32 a duration of 60 s or more reads in minutes and seconds: 379 s is '6 min 19 s'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        json(200, {
          ...base,
          medianSecondsToFirstPlant: { known: true, value: 379, targetMet: false },
          withoutPlantPercent: { known: true, value: 60, targetMet: false },
        }),
      ),
    );
    render(<IntroductionSection api="http://api" token={async () => "tok"} />);
    const row = (await screen.findByText("Mediane Zeit bis zur ersten Pflanze")).closest(
      "li",
    ) as HTMLElement;
    expect(row.textContent).toContain("6\u00a0min 19\u00a0s");
    expect(row.textContent).toContain("nicht erreicht");
  });

  it("US-QS-32 the steps are a row too: the value 2 and the target with its verdict", async () => {
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
    const row = (await screen.findByText("Schritte bis zur ersten Pflanze")).closest(
      "li",
    ) as HTMLElement;
    expect(row.textContent).toContain("2");
    expect(row.textContent).toContain("Ziel: höchstens 3 · erreicht");
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
    const row = (await screen.findByText("Mediane Zeit bis zur ersten Pflanze")).closest(
      "li",
    ) as HTMLElement;
    expect(row.textContent).toContain("unbekannt (zu wenige Konten)");
    expect(row.textContent).toContain("Ziel: höchstens 90 s");
    expect(row.textContent).not.toContain("erreicht");
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

  it("US-QS-15 the figures are rows of one group inside the layer; the layer is a container, not the window (issue 1640)", async () => {
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
    await screen.findByText("Mediane Zeit bis zur ersten Pflanze");
    const region = screen.getByRole("region", { name: "Einstieg" });
    expect(region.className.split(" ")).toContain("@container");
    expect(region.querySelectorAll("li")).toHaveLength(3);
    expect(region.innerHTML.match(/(^|\s)(sm|md|lg|xl):/g)).toBeNull();
  });
});

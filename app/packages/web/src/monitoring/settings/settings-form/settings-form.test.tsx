// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../../kernel";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReminderSettingsForm } from "./settings-form";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const SAVED = {
  sendTime: "08:00",
  quietFrom: null,
  quietTo: null,
  paused: {},
  measurementDays: 30,
};

function fakeServer(saved: unknown = SAVED) {
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      if (new URL(String(url)).pathname !== "/reminders/settings") return response(404, {});
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        puts.push(body);
        return response(200, body);
      }
      return response(200, saved);
    }),
  );
  return puts;
}
const show = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ReminderSettingsForm api="http://api" token={token} />
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-MON-08 reminder settings screen", () => {
  it("US-MON-08 shows the saved time, quiet hours and days", async () => {
    fakeServer({ ...SAVED, sendTime: "07:30", quietFrom: "22:00", quietTo: "06:00" });
    show();
    expect(
      (await screen.findByLabelText<HTMLInputElement>("Uhrzeit der täglichen Prüfung")).value,
    ).toBe("07:30");
    expect(screen.getByLabelText<HTMLInputElement>("Von").value).toBe("22:00");
    expect(screen.getByLabelText<HTMLInputElement>("Bis").value).toBe("06:00");
    expect(screen.getByLabelText<HTMLInputElement>("Messung überfällig nach (Tagen)").value).toBe(
      "30",
    );
  });

  it("US-MON-08 saves time, quiet hours, days and a pause per occasion as a whole and confirms it", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    const time = await screen.findByLabelText("Uhrzeit der täglichen Prüfung");
    await user.clear(time);
    await user.type(time, "07:15");
    await user.type(screen.getByLabelText("Von"), "22:00");
    await user.type(screen.getByLabelText("Bis"), "06:00");
    await user.type(screen.getByLabelText("Gießen pausiert bis"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Erinnerungen speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Erinnerungen gespeichert.");
    expect(puts).toEqual([
      {
        sendTime: "07:15",
        quietFrom: "22:00",
        quietTo: "06:00",
        paused: { watering: "2026-11-01" },
        measurementDays: 30,
      },
    ]);
  });

  it("US-MON-08 ends a pause without touching the other occasions", async () => {
    const puts = fakeServer({ ...SAVED, paused: { watering: "2026-11-01", swap: "2026-11-02" } });
    const user = userEvent.setup();
    show();
    await screen.findByLabelText("Gießen pausiert bis");
    await user.click(screen.getByRole("button", { name: "Gießen: Pause beenden" }));
    await user.click(screen.getByRole("button", { name: "Erinnerungen speichern" }));
    await screen.findByRole("status");
    expect(puts[0]?.["paused"]).toEqual({ swap: "2026-11-02" });
  });

  it("US-MON-08 'Eine Woche' sets the pause to seven days from today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    try {
      fakeServer();
      const user = userEvent.setup({ advanceTimers: () => undefined });
      show();
      await screen.findByLabelText("Gießen pausiert bis");
      await user.click(screen.getByRole("button", { name: "Gießen: eine Woche pausieren" }));
      expect(screen.getByLabelText<HTMLInputElement>("Gießen pausiert bis").value).toBe(
        "2026-10-17",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("US-MON-08 refuses one quiet hour without the other and sends nothing", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText("Von"), "22:00");
    await user.click(screen.getByRole("button", { name: "Erinnerungen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Beginn und Ende");
    expect(puts).toHaveLength(0);
  });

  it("US-MON-08 refuses days outside 1 to 365 and shows the server refusal when it comes", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    const days = await screen.findByLabelText("Messung überfällig nach (Tagen)");
    await user.clear(days);
    await user.type(days, "0");
    await user.click(screen.getByRole("button", { name: "Erinnerungen speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("1 bis 365");
    expect(puts).toHaveLength(0);
  });
});

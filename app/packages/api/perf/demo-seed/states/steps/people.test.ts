import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caller } from "../../access/caller.ts";
import type { Ctx } from "../../accounts/common/shared.ts";
import { operatorArea } from "./people.ts";

// US-DEV-01 / #1111: the operator cost month is the month of the server's UTC clock, the clock `operator_cost.set`
// checks against. The keeper's zone (Europe/Berlin) is one or two hours ahead, so in the last hours of a month Berlin
// is already in the next month and the seed must still send the month the check accepts. The clock is faked (Date only).
type Call = { method: string; path: string; body?: unknown };

function claraRecording(calls: Call[]): Ctx {
  const api = {
    ok: async (_sub: string, method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path === "/operator/overview") return { invitations: [{ status: "open" }] };
      return {};
    },
  } as unknown as Caller;
  return { api, sub: "clara-sub", name: "Clara", log: () => undefined };
}

const costCall = (calls: Call[]) =>
  calls.find((c) => c.method === "PUT" && c.path === "/operator/cost");

describe("US-DEV-01 operator area: the cost month follows the UTC clock (#1111)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("US-DEV-01 at 2026-10-31T23:30Z, when Berlin is already in November, the figure is for October", async () => {
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    const calls: Call[] = [];
    await operatorArea(claraRecording(calls));
    expect(costCall(calls)?.body).toMatchObject({
      amountCents: 4200,
      currency: "EUR",
      month: "2026-10",
    });
  });

  it("US-DEV-01 in the middle of a month the figure is for that month", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const calls: Call[] = [];
    await operatorArea(claraRecording(calls));
    expect(costCall(calls)?.body).toMatchObject({ month: "2026-10" });
  });
});

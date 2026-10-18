import { describe, expect, it } from "vitest";
import { execute } from "../../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../../kernel/test-helpers";
import {
  FIRST_PLANT_GUIDE,
  HINT_OCCASIONS,
  isDismissed,
  onboardingDismissHint,
  onboardingShowHint,
  pickHint,
  type HintRecord,
  type HintStore,
} from "./index";

const base = {
  applicable: [...HINT_OCCASIONS],
  records: [] as HintRecord[],
  style: "few" as const,
  calmMode: false,
  today: "2026-10-18",
};

describe("US-ONB-07 which hint shows", () => {
  it("US-ONB-07 at most one hint is due, the first in the fixed order", () => {
    expect(pickHint(base)).toBe("first_plant_saved");
    expect(pickHint({ ...base, applicable: ["function_unlocked", "plant_without_place"] })).toBe(
      "plant_without_place",
    );
  });

  it("US-ONB-07 a dismissed occasion never returns, the next one waits its turn", () => {
    const records = [
      { occasion: "first_plant_saved", shownOn: "2026-10-17", dismissedOn: "2026-10-17" },
    ];
    expect(pickHint({ ...base, records })).toBe("plant_without_place");
    expect(pickHint({ ...base, records, applicable: ["first_plant_saved"] })).toBeNull();
  });

  it("US-ONB-07 a shown hint stays 7 days, then it leaves and does not come back", () => {
    const shown = (shownOn: string) => [
      { occasion: "first_plant_saved", shownOn, dismissedOn: null },
    ];
    const only = { ...base, applicable: ["first_plant_saved"] };
    expect(pickHint({ ...only, records: shown("2026-10-11") })).toBe("first_plant_saved");
    expect(pickHint({ ...only, records: shown("2026-10-10") })).toBeNull();
  });

  it("US-ONB-07 calm mode and style many show no hint", () => {
    expect(pickHint({ ...base, calmMode: true })).toBeNull();
    expect(pickHint({ ...base, style: "many" })).toBeNull();
  });

  it("US-ONB-07 a situation that does not apply shows nothing", () => {
    expect(pickHint({ ...base, applicable: [] })).toBeNull();
  });

  it("DM-ONB-03 the end of the guide counts as dismissed", () => {
    expect(
      isDismissed(
        [{ occasion: FIRST_PLANT_GUIDE, shownOn: "x", dismissedOn: "y" }],
        FIRST_PLANT_GUIDE,
      ),
    ).toBe(true);
    expect(isDismissed([], FIRST_PLANT_GUIDE)).toBe(false);
  });
});

class Hints implements HintStore {
  readonly rows = new Map<string, HintRecord>();
  async list() {
    return [...this.rows.values()];
  }
  async show(_u: string, occasion: string, on: string) {
    const row = this.rows.get(occasion) ?? { occasion, shownOn: on, dismissedOn: null };
    this.rows.set(occasion, row);
    return row;
  }
  async dismiss(_u: string, occasion: string, on: string) {
    const row = { occasion, shownOn: this.rows.get(occasion)?.shownOn ?? on, dismissedOn: on };
    this.rows.set(occasion, row);
    return row;
  }
}

const run = (hints: Hints, op: "show" | "dismiss", input: unknown) => {
  const operation =
    op === "show" ? onboardingShowHint({ hints }) : onboardingDismissHint({ hints });
  return execute(
    operation,
    { idempotency: new InMemoryIdempotencyStore() },
    { context: { userId: "u1" }, input, idempotencyKey: `k-${Math.random()}` },
  );
};

describe("US-ONB-07 hint operations", () => {
  it("US-ONB-07 shows and dismisses a known occasion", async () => {
    const hints = new Hints();
    const shown = await run(hints, "show", { occasion: "first_plant_saved", on: "2026-10-18" });
    expect(shown.ok).toBe(true);
    const gone = await run(hints, "dismiss", { occasion: "first_plant_saved", on: "2026-10-19" });
    expect(gone.ok && gone.value).toEqual({
      occasion: "first_plant_saved",
      shownOn: "2026-10-18",
      dismissedOn: "2026-10-19",
    });
  });

  it("DM-ONB-03 the guide can be ended through the same operation", async () => {
    const r = await run(new Hints(), "dismiss", { occasion: FIRST_PLANT_GUIDE, on: "2026-10-18" });
    expect(r.ok).toBe(true);
  });

  it("US-ONB-07 an unknown occasion is refused with a stable code and stores nothing", async () => {
    const hints = new Hints();
    const r = await run(hints, "dismiss", { occasion: "tour_step_3", on: "2026-10-18" });
    expect(!r.ok && r.error.code).toBe("onboarding.unknown_occasion");
    expect(hints.rows.size).toBe(0);
  });

  it("US-ONB-07 a missing date is an input error", async () => {
    const r = await run(new Hints(), "show", { occasion: "first_plant_saved" });
    expect(!r.ok && r.error.code).toBe("input.invalid");
  });
});

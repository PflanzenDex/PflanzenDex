import { describe, expect, it } from "vitest";
import { FIRST_PLANT_STEPS } from "../index";
import { InMemoryAccess } from "../test-helpers";
import {
  INTRODUCTION_MIN_ACCOUNTS,
  introductionFigures,
  operatorIntroduction,
  type IntroductionRaw,
} from "./introduction";

const RAW: IntroductionRaw = {
  accounts: 12,
  settled: 10,
  settledWithoutPlant: 2,
  withPlant: 9,
  medianSeconds: 75,
};

describe("US-ONB-08 figures of the introduction", () => {
  it("US-ONB-08 compares the median time and the share without a plant with the targets; steps come by construction", () => {
    const f = introductionFigures(RAW);
    expect(f.medianSecondsToFirstPlant).toEqual({ known: true, value: 75, targetMet: true });
    expect(f.withoutPlantPercent).toEqual({ known: true, value: 20, targetMet: true });
    expect(f.steps).toEqual({ value: FIRST_PLANT_STEPS.length, targetMet: true });
    expect(
      introductionFigures({ ...RAW, medianSeconds: 120 }).medianSecondsToFirstPlant,
    ).toMatchObject({
      value: 120,
      targetMet: false,
    });
    expect(
      introductionFigures({ ...RAW, settled: 8, settledWithoutPlant: 4 }).withoutPlantPercent,
    ).toMatchObject({ value: 50, targetMet: false });
  });

  it("US-ONB-08 · P-08 · P-05 below the minimum of accounts a figure is unknown with its reason, never a number about a few people", () => {
    const few = INTRODUCTION_MIN_ACCOUNTS - 1;
    const f = introductionFigures({ ...RAW, settled: few, withPlant: few });
    expect(f.medianSecondsToFirstPlant).toEqual({ known: false, reason: "too_few_accounts" });
    expect(f.withoutPlantPercent).toEqual({ known: false, reason: "too_few_accounts" });
    const none = introductionFigures({
      accounts: 0,
      settled: 0,
      settledWithoutPlant: 0,
      withPlant: 0,
      medianSeconds: null,
    });
    expect(none.withoutPlantPercent.known).toBe(false);
    expect(none.accounts).toBeNull();
  });

  it("US-ONB-08 · P-05 counts the database already masked (null) stay unknown, and the count of accounts below the minimum is not shown", () => {
    const masked = introductionFigures({
      accounts: null,
      settled: null,
      settledWithoutPlant: null,
      withPlant: null,
      medianSeconds: null,
    });
    expect(masked.accounts).toBeNull();
    expect(masked.medianSecondsToFirstPlant.known).toBe(false);
    expect(masked.withoutPlantPercent.known).toBe(false);
    expect(
      introductionFigures({ ...RAW, accounts: INTRODUCTION_MIN_ACCOUNTS - 1 }).accounts,
    ).toBeNull();
  });

  it("US-ONB-08 · P-04 only the operator reads the figures; a reviewer and a keeper get access.denied and the store is not asked", async () => {
    const access = new InMemoryAccess({ olga: ["operator"], rita: ["reviewer"], kai: [] });
    const asked: string[] = [];
    const store = {
      figures: async (userId: string) => {
        asked.push(userId);
        return RAW;
      },
    };
    const ok = await operatorIntroduction({ access, store }, "olga");
    expect(ok.ok && ok.value.accounts).toBe(12);
    for (const who of ["rita", "kai"]) {
      const r = await operatorIntroduction({ access, store }, who);
      expect(!r.ok && r.error.code).toBe("access.denied");
    }
    expect(asked).toEqual(["olga"]);
  });
});

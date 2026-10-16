import { describe, expect, it } from "vitest";
import { execute } from "../../kernel/operation";
import { InMemoryIdempotencyStore } from "../../kernel/test-helpers";
import {
  achievementsSetCalmMode,
  readAchievementSettings,
  showsAchievements,
  type AchievementSettings,
  type AchievementSettingsStore,
} from "../index";

class InMemorySettings implements AchievementSettingsStore {
  readonly rows = new Map<string, AchievementSettings>();
  async find(userId: string) {
    return this.rows.get(userId) ?? null;
  }
  async setCalmMode(userId: string, calmMode: boolean) {
    this.rows.set(userId, { calmMode });
    return { calmMode };
  }
}

const setup = () => {
  const settings = new InMemorySettings();
  const idempotency = new InMemoryIdempotencyStore();
  let n = 0;
  const run = (userId: string, input: unknown) =>
    execute(
      achievementsSetCalmMode({ settings }),
      { idempotency },
      { context: { userId }, input, idempotencyKey: `k${++n}` },
    );
  return { settings, run };
};

describe("US-ACH-08 calm mode", () => {
  it("US-ACH-08 is off by default for an account that never set it", async () => {
    const { settings } = setup();
    const s = await readAchievementSettings(settings, "anna");
    expect(s).toEqual({ calmMode: false });
    expect(showsAchievements(s)).toBe(true);
  });

  it("US-ACH-08 switching on hides the elements, switching off shows them again", async () => {
    const { settings, run } = setup();
    expect(await run("anna", { calmMode: true })).toMatchObject({
      ok: true,
      value: { calmMode: true },
    });
    expect(showsAchievements(await readAchievementSettings(settings, "anna"))).toBe(false);
    await run("anna", { calmMode: false });
    expect(showsAchievements(await readAchievementSettings(settings, "anna"))).toBe(true);
  });

  it("US-ACH-08 is per account: one keeper's choice never reaches another", async () => {
    const { settings, run } = setup();
    await run("anna", { calmMode: true });
    expect(await readAchievementSettings(settings, "ben")).toEqual({ calmMode: false });
  });

  it("US-ACH-08 refuses anything but a boolean and writes nothing", async () => {
    const { settings, run } = setup();
    for (const bad of [{}, { calmMode: "yes" }, { calmMode: 1 }, { calmMode: null }, null]) {
      expect(await run("anna", bad)).toMatchObject({ ok: false });
    }
    expect(settings.rows.size).toBe(0);
  });
});

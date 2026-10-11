import { createFixtureSpecimenAt } from "../collection/index.ts";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `monitoring` (FR-QG-07).
export const FIXTURES_MONITORING: Fixtures = {
  reminder_setting: () => ({}),
  delivery_channel: () => ({
    endpoint: "https://push.example/fixture-endpoint",
    p256dh: "fixture-key",
    auth: "fixture-auth",
  }),
  watering_log: async (k) => ({
    specimen_id: await createFixtureSpecimenAt(k),
    watered_on: "2026-10-10",
  }),
  reminder: () => ({ local_date: "2026-10-10", status: "none" }),
};

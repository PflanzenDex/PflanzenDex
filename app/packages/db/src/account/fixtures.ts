import type { Fixtures } from "../kernel/index.ts";

// Tables of the `account` module (FR-QG-07).
export const FIXTURES_ACCOUNT: Fixtures = {
  account_data: () => ({ email: "test@example.test" }),
  account_unlock: () => ({ function_id: "wishlist", unlocked_on: "2026-07-01", source: "tap" }),
};

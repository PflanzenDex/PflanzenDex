import type { Fixtures } from "../kernel/index.ts";

// Tables of the `account` module (FR-QG-07).
export const FIXTURES_ACCOUNT: Fixtures = {
  account_data: () => ({ email: "test@example.test" }),
};

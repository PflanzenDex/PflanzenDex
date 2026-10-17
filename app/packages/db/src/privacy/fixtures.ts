import type { Fixtures } from "../kernel/index.ts";

// Tables of the `privacy` module with an account id (FR-QG-07).
export const FIXTURES_PRIVACY: Fixtures = {
  account_deletion: () => ({ due_at: "2999-01-01T00:00:00Z" }),
};

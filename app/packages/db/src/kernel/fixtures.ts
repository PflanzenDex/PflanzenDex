import type { Fixtures } from "./isolation.ts";

// Tables of the `kernel` module: tenant anchor and idempotency (FR-QG-07).
export const FIXTURES_KERNEL: Fixtures = {
  account: () => ({}),
  idempotency: () => ({ operation: "test.test", key: "k1", fingerprint: "{}" }),
};

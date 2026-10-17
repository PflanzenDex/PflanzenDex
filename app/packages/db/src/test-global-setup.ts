import { ensureTestOwnerDatabase } from "./kernel/index.ts";

// Vitest global setup of every package that talks to the test database (#294, QG-D1): makes sure the non-superuser
// owner role and its database exist before the first test file opens `openOwnerPool()`.
export default async function setup(): Promise<void> {
  await ensureTestOwnerDatabase();
}

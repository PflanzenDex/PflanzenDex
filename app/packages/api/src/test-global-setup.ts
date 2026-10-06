import { ensureTestOwnerDatabase } from "@pflanzendex/db";

// Vitest global setup of the api suite (#485, QG-D1), mirroring `db/src/test-global-setup.ts`: makes sure the
// non-superuser owner role and its database exist before the first test file opens `openOwnerPool()`.
export default async function setup(): Promise<void> {
  await ensureTestOwnerDatabase();
}

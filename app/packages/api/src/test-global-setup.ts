import { ensureTestOwnerDatabase, openFixturePool } from "@pflanzendex/db";

// Vitest global setup of the api suite (#485, QG-D1), mirroring `db/src/test-global-setup.ts`: makes sure the
// non-superuser owner role and its database exist before the first test file opens `openOwnerPool()`.
export default async function setup(): Promise<void> {
  await ensureTestOwnerDatabase();
  await purgeOrphanedReviewCases();
}

// Many test files delete their species directly in `afterAll`; the review case of a species has no foreign key to it and
// stays behind (about 200 rows per run). A test database that lives longer than one run (every local worktree) piled
// them up, `GET /review` lists all open ones with a row rule per row, and the review/corrections files grew from 3 s to
// over 30 s until their hooks and tests timed out (US-QG-01, #994). Nothing else runs yet, so the purge is safe here.
async function purgeOrphanedReviewCases(): Promise<void> {
  const admin = openFixturePool();
  try {
    await admin.query(
      `do $$ begin
         if to_regclass('review_case') is not null and to_regclass('species') is not null then
           delete from review_case rc where rc.object_kind = 'species'
             and not exists (select from species s where s.id = rc.object_id);
         end if;
       end $$`,
    );
  } finally {
    await admin.end();
  }
}

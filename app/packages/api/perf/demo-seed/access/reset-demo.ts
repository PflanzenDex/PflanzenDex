import type { Pool } from "pg";
import type { Subjects } from "./subjects.ts";

// The state of the demo accounts that a second `make db-seed` restores (US-DEV-01): device checks repeat the flows of test,
// test2 and test3, so a run after a check leaves a fresh friend request and an achievement that is new again. Written on
// the owner connection like `resetHints` and `grantRoles`: the application role has no right to delete friendships, and
// the seed guard keeps this to local databases. Only the rows of the three demo accounts are touched.

const DEMO_ACCOUNTS = "select id from account where subject = any($1)";

/**
 * Restores the friend requests of the base seed (US-SOZ-02): Ben's request to Anna is open. The rows of that pair go in
 * any state, because a check may have accepted the request and `befriend` in `seedAll` skips a confirmed pair. The other
 * requests, declined and ended friendships of the demo accounts go too, and the friend codes they created. A confirmed
 * friendship of another pair stays: a recreated one starts now, and the feed counts every share since its start as new
 * (`visible_since`, US-SOZ-06). Measured on the states profile: recreating Anna-Clara and Ben-Clara raised Anna's banner
 * from 1 to 9.
 */
export async function resetDemoFriends(pool: Pool, subjects: Subjects): Promise<void> {
  await pool.query(
    `delete from friendship f using account a, account o
      where f.account_id = a.id and f.other_id = o.id
        and a.subject = any($1) and o.subject = any($1)
        and (f.status <> 'confirmed'
          or (a.subject = $2 and o.subject = $3)
          or (a.subject = $3 and o.subject = $2))`,
    [Object.values(subjects), subjects.test, subjects.test2],
  );
  await pool.query(`delete from friend_code where created_by in (${DEMO_ACCOUNTS})`, [
    Object.values(subjects),
  ]);
}

/**
 * Makes Ben's achievement "first-handover" (US-ACH-03) new again after a check marked it seen. The states profile hands
 * a swap over only once: a later run finds the handover done and writes no seen state, so the marked state would stay.
 * Only the id leaves `seen_achievements`; the row stays, because it is the marker of the first evaluation (FR-ACH-09).
 * Without a row there is nothing to restore.
 */
export async function restoreAchievementNews(pool: Pool, subjects: Subjects): Promise<void> {
  await pool.query(
    "update achievement_seen set seen_achievements = array_remove(seen_achievements, 'first-handover') where account_id = (select id from account where subject = $1)",
    [subjects.test2],
  );
}

/**
 * Removes the match answers (decline "no" and "later", US-TAU-01) of the demo accounts, so a deck that a device check
 * answered shows its cards again; the "Wieder ansehen" button of the answer lists does the same by hand. The rows are
 * keeper choices, not seed content, so the seed never writes them and a plain delete restores the start (idempotent).
 * A "request" answer is no row here: it is a swap request and stays (see the swap rows above). Only the three demo
 * accounts are touched.
 */
export async function resetDemoMatchAnswers(pool: Pool, subjects: Subjects): Promise<void> {
  await pool.query(`delete from swap_match_answer where account_id in (${DEMO_ACCOUNTS})`, [
    Object.values(subjects),
  ]);
}

import type { Pool } from "pg";

/**
 * Own path for registration and sign-in (US-ACC-01): finds the account for the verified subject of the
 * sign-in service or creates it. Only the API process calls this, with the `sub` of a verified token.
 * The row rules `sign_in_*` allow only the row of this subject here (migration 0003), no BYPASSRLS.
 */
export async function findOrCreateAccount(pool: Pool, subject: string): Promise<string> {
  if (subject.trim() === "") throw new Error("Subject missing");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.subject', $1, true)", [subject]);
    // Concurrent first sign-ins: the unique index on `subject` decides, `do nothing` reports no error.
    await client.query(
      "insert into account (subject) values ($1) on conflict (subject) do nothing",
      [subject],
    );
    const r = await client.query<{ id: string }>("select id from account where subject = $1", [
      subject,
    ]);
    await client.query("commit");
    const id = r.rows[0]?.id;
    if (!id) throw new Error("Account could not be created");
    return id;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function lookUp(
  pool: Pool,
  subject: string,
  override: { invitationOnly?: boolean } | undefined,
): Promise<{ id: string | null; required: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.subject', $1, true)", [subject]);
    const known = await client.query<{ id: string }>("select id from account where subject = $1", [
      subject,
    ]);
    const mode = await client.query<{ required: boolean }>(
      "select invitation_required() as required",
    );
    return {
      id: known.rows[0]?.id ?? null,
      required: override?.invitationOnly ?? mode.rows[0]?.required === true,
    };
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/**
 * Sign-in of a verified subject under the registration mode (US-ACC-05): a known subject always gets its account; an
 * unknown one gets one only while registration is open. `null` means "invitation code needed" and creates nothing.
 * `override` forces the mode for one call (tests of the API); without it the setting of the operator decides.
 */
export async function admitAccount(
  pool: Pool,
  subject: string,
  override?: { invitationOnly?: boolean },
): Promise<string | null> {
  if (subject.trim() === "") throw new Error("Subject missing");
  const { id, required } = await lookUp(pool, subject, override);
  if (id) return id;
  return required ? null : findOrCreateAccount(pool, subject);
}

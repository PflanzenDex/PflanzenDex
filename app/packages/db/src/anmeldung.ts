import type { Pool } from "pg";

/**
 * Eigener Weg für Registrierung und Anmeldung (US-ACC-01): findet das Konto zum geprüften Subjekt des
 * Anmeldedienstes oder legt es an. Nur der API-Prozess ruft das mit dem `sub` eines geprüften Tokens auf.
 * Die Zeilenregeln `anmeldung_*` erlauben dabei nur die Zeile dieses Subjekts (Migration 0003), kein BYPASSRLS.
 */
export async function findeOderLegeKonto(pool: Pool, subjekt: string): Promise<string> {
  if (subjekt.trim() === "") throw new Error("Subjekt fehlt");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.subjekt', $1, true)", [subjekt]);
    // Gleichzeitige erste Anmeldungen: der Unique-Index auf `subjekt` entscheidet, `do nothing` meldet keinen Fehler.
    await client.query("insert into konto (subjekt) values ($1) on conflict (subjekt) do nothing", [
      subjekt,
    ]);
    const r = await client.query<{ id: string }>("select id from konto where subjekt = $1", [
      subjekt,
    ]);
    await client.query("commit");
    const id = r.rows[0]?.id;
    if (!id) throw new Error("Konto konnte nicht angelegt werden");
    return id;
  } catch (fehler) {
    await client.query("rollback");
    throw fehler;
  } finally {
    client.release();
  }
}

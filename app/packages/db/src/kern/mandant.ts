import type { Pool, PoolClient } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Führt `rumpf` in einer Transaktion als Anwendungsrolle für genau ein Konto aus (P-03, P-04).
 * Die Sitzungsvariable gilt nur bis zum Ende der Transaktion (`set_config(..., true)`), kann also
 * bei Wiederverwendung der Verbindung nicht in eine fremde Anfrage hinüberleben.
 */
export async function mitKonto<T>(
  pool: Pool,
  kontoId: string,
  rumpf: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(kontoId)) throw new Error("Konto-Kennung ist keine UUID");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.konto_id', $1, true)", [kontoId]);
    const ergebnis = await rumpf(client);
    await client.query("commit");
    return ergebnis;
  } catch (fehler) {
    await client.query("rollback");
    throw fehler;
  } finally {
    client.release();
  }
}

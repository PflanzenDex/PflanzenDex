import { migriere } from "./migrate.ts";
import { oeffnePool } from "./verbindung.ts";

// Aufruf: `DATABASE_URL=postgres://... npm run migrate -w @pflanzendex/db`
const url = process.env["DATABASE_URL"] ?? process.env["PFLANZENDEX_TEST_DATABASE_URL"];
const pool = oeffnePool(url);
try {
  const neu = await migriere(pool);
  console.log(neu.length ? `Angewendet: ${neu.join(", ")}` : "Schema ist aktuell.");
} finally {
  await pool.end();
}

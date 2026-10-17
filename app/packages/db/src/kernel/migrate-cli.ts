import { migrate } from "./migrate.ts";
import { openPool } from "./connection.ts";

// Aufruf: `DATABASE_URL=postgres://... npm run migrate -w @pflanzendex/db`
const url = process.env["DATABASE_URL"] ?? process.env["PFLANZENDEX_TEST_DATABASE_URL"];
const pool = openPool(url);
try {
  const fresh = await migrate(pool);
  console.log(fresh.length ? `Applied: ${fresh.join(", ")}` : "Schema is up to date.");
} finally {
  await pool.end();
}

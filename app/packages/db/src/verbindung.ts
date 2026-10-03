import pg from "pg";

// Standard für die lokale Test-Datenbank aus `make db-up`; die CI setzt die Variable (E-01: Selbstbetrieb, Docker).
export const TEST_DB_STANDARD = "postgres://postgres:postgres@127.0.0.1:54329/pflanzendex_test";

export function testDatenbankUrl(): string {
  return process.env["PFLANZENDEX_TEST_DATABASE_URL"] ?? TEST_DB_STANDARD;
}

export function oeffnePool(url: string = testDatenbankUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 4 });
}

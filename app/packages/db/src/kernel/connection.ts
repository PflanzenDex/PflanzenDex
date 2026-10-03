import pg from "pg";

// Default for the local test database from `make db-up`; CI sets the variable (E-01: self-hosting, Docker).
export const TEST_DB_STANDARD = "postgres://postgres:postgres@127.0.0.1:54329/pflanzendex_test";

export function testDatabaseUrl(): string {
  return process.env["PFLANZENDEX_TEST_DATABASE_URL"] ?? TEST_DB_STANDARD;
}

export function openPool(url: string = testDatabaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 4 });
}

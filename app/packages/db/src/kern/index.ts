// Öffentliche Schnittstelle des Moduls `kern` (ADR 0003): Mandantenzugriff, Verbindung, Migrationen, Idempotenz.
export { mitKonto } from "./mandant.ts";
export { migriere, MIGRATIONS_VERZEICHNIS, type MigrationsOptionen } from "./migrate.ts";
export { findeSchemaVerstoesse, mandantenTabellen, OHNE_KONTO_KENNUNG } from "./schema.ts";
export { pruefeMandantentrennung, type Fixtures } from "./trennung.ts";
export { oeffnePool, testDatenbankUrl } from "./verbindung.ts";
export { IdempotenzPostgres } from "./idempotenz.ts";
export { FIXTURES_KERN } from "./fixtures.ts";

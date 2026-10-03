import type { Fixtures } from "./trennung.ts";

// Tabellen des Moduls `kern`: Mandantenanker und Idempotenz (FR-QG-07).
export const FIXTURES_KERN: Fixtures = {
  konto: () => ({}),
  idempotenz: () => ({ operation: "test.test", schluessel: "k1", fingerabdruck: "{}" }),
};

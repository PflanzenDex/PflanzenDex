import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `ai` (FR-QG-07).
export const FIXTURES_AI_ACCESS: Fixtures = {
  ai_connection: () => ({ client_id: "https://client.example/fixture", client_name: "Fixture" }),
};

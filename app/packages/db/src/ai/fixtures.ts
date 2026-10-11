import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `ai` (FR-QG-07).
export const FIXTURES_AI_ACCESS: Fixtures = {
  ai_connection: () => ({
    client_id: `https://client.example/${randomUUID()}`,
    client_name: "Fixture",
  }),
  ai_log: async (k) => {
    const r = await k.query.query<{ id: string }>(
      "insert into ai_connection (account_id, client_id, client_name) values ($1, $2, 'Fixture') returning id",
      [k.accountId, `https://client.example/${randomUUID()}`],
    );
    return {
      connection_id: (r.rows[0] as { id: string }).id,
      operation: "status",
      effect: "fixture",
    };
  },
  ai_draft: async (k) => {
    const r = await k.query.query<{ id: string }>(
      "insert into ai_connection (account_id, client_id, client_name) values ($1, $2, 'Fixture') returning id",
      [k.accountId, `https://client.example/${randomUUID()}`],
    );
    return {
      connection_id: (r.rows[0] as { id: string }).id,
      type: "wish",
      content: { name: "Fixture" },
      content_key: "{}",
      source: "https://example.test/source",
    };
  },
  ai_task: () => ({ type: "species_profile", reference: "Fixture", label: "Fixture" }),
};

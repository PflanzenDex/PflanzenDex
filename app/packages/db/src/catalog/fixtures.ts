import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the `catalog` module (FR-QG-07).
export const FIXTURES_CATALOG: Fixtures = {
  review_case: () => ({ object_kind: "species", object_id: randomUUID(), status: "proposal" }),
};

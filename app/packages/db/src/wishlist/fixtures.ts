import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `wishlist` (FR-QG-07). A wish needs nothing but its name; the target zone stays unknown.
export const FIXTURES_WISHLIST: Fixtures = {
  wish: () => ({ name: "Haworthia fasciata" }),
};

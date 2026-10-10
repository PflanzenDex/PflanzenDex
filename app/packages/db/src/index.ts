// Public interface of `db`: collects the interfaces of the modules (ADR 0003).
export * from "./kernel/index.ts";
export * from "./account/index.ts";
export * from "./catalog/index.ts";
export * from "./light/index.ts";
export * from "./collection/index.ts";
export * from "./care/index.ts";
export * from "./wishlist/index.ts";
export * from "./pokedex/index.ts";
export * from "./social/index.ts";
export * from "./swap/index.ts";
export * from "./monitoring/index.ts";
export * from "./ai/index.ts";
export * from "./jobs/index.ts";
export * from "./pokedex/index.ts";
export { findSchemaViolations } from "./schema-check.ts";

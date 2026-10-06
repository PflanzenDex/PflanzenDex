import type { JobHandlers } from "@pflanzendex/core";

/**
 * The handlers of all job types, by type `<module>.<job>`. Modules register theirs here when they bring a job
 * (reminders: MON, catalog build: POK, AI orders: KI); a handler must be repeatable (US-QS-03). Handlers that need ports (database,
 * sources) are exported by their module and composed in `main.ts` next to this register (the module matrix lets
 * `jobs` depend on `kernel` only). A job of an unregistered type ends dead and visible instead of waiting forever.
 */
export const JOB_HANDLERS: JobHandlers = {};
